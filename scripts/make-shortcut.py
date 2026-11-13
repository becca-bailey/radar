#!/usr/bin/env python3
"""Build and sign the "Put it on Radar" iOS Shortcut.

Produces public/radar.shortcut (signed, importable on iOS 15+/macOS 12+).
Signing uses the macOS `shortcuts` CLI, so this must run on a Mac:

    python3 scripts/make-shortcut.py

The shortcut accepts a page from the share sheet, extracts the URL, fetches
its options (GET /api/shortcut-options), asks for an optional note unless
the person turned that off in Settings, and, if they're in any groups, asks
whether to share it to one ("Just save" first). Then
it POSTs url + note + share_to to /api/saves with a Bearer token and shows
the reply's message. The token is an import question: the Shortcuts app
asks the person to paste theirs when they first set up the shortcut, and
our placeholder value is stripped from the shared file.

Nothing here can be checked without a device: after signing, import it on
an iPhone and try a save with no groups, with groups, and with a blank note.
"""

import plistlib
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

SITE = "https://onyourradar.app"

# U+FFFC marks where Shortcuts splices an attachment into a string.
ATTACH = "￼"

UUID_TOKEN = str(uuid.uuid4()).upper()
UUID_LINKS = str(uuid.uuid4()).upper()
UUID_FIRST = str(uuid.uuid4()).upper()
UUID_RESP = str(uuid.uuid4()).upper()
UUID_MSG = str(uuid.uuid4()).upper()
UUID_NOTE = str(uuid.uuid4()).upper()
UUID_GROUPS = str(uuid.uuid4()).upper()
UUID_CHOICES = str(uuid.uuid4()).upper()
UUID_COUNT = str(uuid.uuid4()).upper()
UUID_CHOSEN = str(uuid.uuid4()).upper()
UUID_JUST_SAVE = str(uuid.uuid4()).upper()
UUID_IF = str(uuid.uuid4()).upper()
GROUP_IF = str(uuid.uuid4()).upper()
UUID_ASK_NOTE = str(uuid.uuid4()).upper()
UUID_NO_NOTE = str(uuid.uuid4()).upper()
UUID_NOTE_IF = str(uuid.uuid4()).upper()
GROUP_NOTE_IF = str(uuid.uuid4()).upper()


def text_token(string, attachments=None):
    return {
        "WFSerializationType": "WFTextTokenString",
        "Value": {"string": string, "attachmentsByRange": attachments or {}},
    }


def dictionary_field(items):
    return {
        "WFSerializationType": "WFDictionaryFieldValue",
        "Value": {"WFDictionaryFieldValueItems": items},
    }


def text_item(key, value_token):
    return {"WFItemType": 0, "WFKey": text_token(key), "WFValue": value_token}


def output_ref(uuid_, name):
    return {"Type": "ActionOutput", "OutputUUID": uuid_, "OutputName": name}


def output_attachment(uuid_, name):
    return {"WFSerializationType": "WFTextTokenAttachment", "Value": output_ref(uuid_, name)}


def output_text(uuid_, name):
    """A text field holding exactly one action's output."""
    return text_token(ATTACH, {"{0, 1}": output_ref(uuid_, name)})


def auth_headers():
    # References the token action's output directly; see the gettext note.
    return dictionary_field(
        [
            text_item(
                "Authorization",
                text_token(f"Bearer {ATTACH}", {"{7, 1}": output_ref(UUID_TOKEN, "Radar API Token")}),
            )
        ]
    )


workflow = {
    "WFWorkflowClientVersion": "2605.0.5",
    "WFWorkflowMinimumClientVersion": 900,
    "WFWorkflowMinimumClientVersionString": "900",
    "WFWorkflowHasOutputFallback": False,
    "WFWorkflowHasShortcutInputVariables": True,
    "WFWorkflowIcon": {
        # Teal background, radar-ish "scope" glyph.
        "WFWorkflowIconStartColor": 431817727,
        "WFWorkflowIconGlyphNumber": 59511,
    },
    # Share-sheet shortcut.
    "WFWorkflowTypes": ["ActionExtension"],
    "WFWorkflowInputContentItemClasses": [
        "WFURLContentItem",
        "WFSafariWebPageContentItem",
        "WFStringContentItem",
        "WFRichTextContentItem",
        "WFArticleContentItem",
    ],
    "WFWorkflowOutputContentItemClasses": [],
    # Asked once, on first run after install; our placeholder is cleared
    # from the shared file by Shortcuts itself.
    "WFWorkflowImportQuestions": [
        {
            "ActionIndex": 3,
            "Category": "Parameter",
            "ParameterKey": "WFTextActionText",
            "Text": "Paste your Radar API token (Radar → Settings → API tokens)",
        }
    ],
    "WFWorkflowActions": [
        {
            # Shortcut Input as a text token with the magic variable in
            # the attachment slot. Copied from a copy fixed by hand in
            # the Shortcuts editor (iOS, Nov 2026). The implicit form and
            # both WFTextTokenAttachment forms (single and double wrap)
            # imported as an unresolved "Input" and sent empty URLs.
            "WFWorkflowActionIdentifier": "is.workflow.actions.detect.link",
            "WFWorkflowActionParameters": {
                "UUID": UUID_LINKS,
                "WFInput": text_token(ATTACH, {"{0, 1}": {"Type": "ExtensionInput"}}),
            },
        },
        {
            # A share can carry several links; save the first.
            "WFWorkflowActionIdentifier": "is.workflow.actions.getitemfromlist",
            "WFWorkflowActionParameters": {
                "UUID": UUID_FIRST,
                "WFItemSpecifier": "First Item",
                "WFInput": {
                    "WFSerializationType": "WFTextTokenAttachment",
                    "Value": {
                        "Type": "ActionOutput",
                        "OutputUUID": UUID_LINKS,
                        "OutputName": "URLs",
                    },
                },
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.comment",
            "WFWorkflowActionParameters": {
                "WFCommentActionText": "Your Radar API token goes in the Text box below."
            },
        },
        {
            # The Authorization header references this action's output
            # directly; a named variable here once got rebound to the
            # share-sheet input on import, sending "Bearer <page URL>".
            "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
            "WFWorkflowActionParameters": {
                "UUID": UUID_TOKEN,
                "WFTextActionText": "paste-your-radar-token",
                "CustomOutputName": "Radar API Token",
            },
        },
        {
            # Options: {"ask_note": "yes"|"no", "choices": ["Just save", …]}.
            "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
            "WFWorkflowActionParameters": {
                "UUID": UUID_GROUPS,
                "WFURL": f"{SITE}/api/shortcut-options",
                "WFHTTPMethod": "GET",
                "ShowHeaders": True,
                "WFHTTPHeaders": auth_headers(),
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.getvalueforkey",
            "WFWorkflowActionParameters": {
                "UUID": UUID_ASK_NOTE,
                "WFDictionaryKey": "ask_note",
                "WFInput": output_attachment(UUID_GROUPS, "Contents of URL"),
            },
        },
        {
            # WFCondition 4 is "is" (text equals).
            "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
            "WFWorkflowActionParameters": {
                "GroupingIdentifier": GROUP_NOTE_IF,
                "WFControlFlowMode": 0,
                "WFCondition": 4,
                "WFConditionalActionString": "yes",
                "WFInput": {"Type": "Variable", "Variable": output_attachment(UUID_ASK_NOTE, "Dictionary Value")},
            },
        },
        {
            # Optional: tapping Done with nothing typed saves without a note.
            "WFWorkflowActionIdentifier": "is.workflow.actions.ask",
            "WFWorkflowActionParameters": {
                "UUID": UUID_NOTE,
                "WFAskActionPrompt": "Why are you saving it? (optional)",
                "WFInputType": "Text",
                "WFAllowsMultilineText": False,
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
            "WFWorkflowActionParameters": {"GroupingIdentifier": GROUP_NOTE_IF, "WFControlFlowMode": 1},
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
            "WFWorkflowActionParameters": {"UUID": UUID_NO_NOTE, "WFTextActionText": ""},
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
            "WFWorkflowActionParameters": {
                "GroupingIdentifier": GROUP_NOTE_IF,
                "WFControlFlowMode": 2,
                "UUID": UUID_NOTE_IF,
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.getvalueforkey",
            "WFWorkflowActionParameters": {
                "UUID": UUID_CHOICES,
                "WFDictionaryKey": "choices",
                "WFInput": output_attachment(UUID_GROUPS, "Contents of URL"),
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.count",
            "WFWorkflowActionParameters": {
                "UUID": UUID_COUNT,
                "WFCountType": "Items",
                "Input": output_attachment(UUID_CHOICES, "Dictionary Value"),
            },
        },
        {
            # Only ask when there's more than "Just save" to pick from.
            # WFCondition 2 is "is greater than".
            "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
            "WFWorkflowActionParameters": {
                "GroupingIdentifier": GROUP_IF,
                "WFControlFlowMode": 0,
                "WFCondition": 2,
                "WFNumberValue": "1",
                "WFInput": {"Type": "Variable", "Variable": output_attachment(UUID_COUNT, "Count")},
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.choosefromlist",
            "WFWorkflowActionParameters": {
                "UUID": UUID_CHOSEN,
                "WFInput": output_attachment(UUID_CHOICES, "Dictionary Value"),
                "WFChooseFromListActionPrompt": "Share to a group?",
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
            "WFWorkflowActionParameters": {"GroupingIdentifier": GROUP_IF, "WFControlFlowMode": 1},
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.gettext",
            "WFWorkflowActionParameters": {"UUID": UUID_JUST_SAVE, "WFTextActionText": "Just save"},
        },
        {
            # The If block's output is whichever branch ran last.
            "WFWorkflowActionIdentifier": "is.workflow.actions.conditional",
            "WFWorkflowActionParameters": {
                "GroupingIdentifier": GROUP_IF,
                "WFControlFlowMode": 2,
                "UUID": UUID_IF,
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
            "WFWorkflowActionParameters": {
                "UUID": UUID_RESP,
                "WFURL": f"{SITE}/api/saves",
                "WFHTTPMethod": "POST",
                "ShowHeaders": True,
                "WFHTTPHeaders": auth_headers(),
                "WFHTTPBodyType": "JSON",
                "WFJSONValues": dictionary_field(
                    [
                        text_item("url", output_text(UUID_FIRST, "Item from List")),
                        text_item("note", output_text(UUID_NOTE_IF, "If Result")),
                        text_item("share_to", output_text(UUID_IF, "If Result")),
                    ]
                ),
            },
        },
        {
            # The API answers every JSON request with a human-readable
            # "message" ("Saved to Radar", "Not saved — invalid Radar
            # token", …); showing it keeps failures visible.
            "WFWorkflowActionIdentifier": "is.workflow.actions.getvalueforkey",
            "WFWorkflowActionParameters": {
                "UUID": UUID_MSG,
                "WFDictionaryKey": "message",
                "WFInput": {
                    "WFSerializationType": "WFTextTokenAttachment",
                    "Value": {
                        "Type": "ActionOutput",
                        "OutputUUID": UUID_RESP,
                        "OutputName": "Contents of URL",
                    },
                },
            },
        },
        {
            "WFWorkflowActionIdentifier": "is.workflow.actions.notification",
            "WFWorkflowActionParameters": {
                "WFNotificationActionTitle": "Radar",
                "WFNotificationActionBody": text_token(
                    ATTACH,
                    {
                        "{0, 1}": {
                            "Type": "ActionOutput",
                            "OutputUUID": UUID_MSG,
                            "OutputName": "Dictionary Value",
                        }
                    },
                ),
                "WFNotificationActionSound": False,
            },
        },
    ],
}


def main() -> int:
    repo = Path(__file__).resolve().parent.parent
    # The imported shortcut is named after the file, so both the unsigned
    # input and the signed output carry the real name.
    name = "Put it on Radar.shortcut"
    out = repo / "public" / name
    tmpdir = tempfile.mkdtemp()
    unsigned = str(Path(tmpdir) / name)
    with open(unsigned, "wb") as f:
        plistlib.dump(workflow, f, fmt=plistlib.FMT_BINARY)
    result = subprocess.run(
        ["shortcuts", "sign", "--mode", "anyone", "--input", unsigned, "--output", str(out)],
    )
    if result.returncode != 0:
        print("signing failed; unsigned file left at", unsigned, file=sys.stderr)
        return result.returncode
    print("wrote", out)
    return 0


if __name__ == "__main__":
    sys.exit(main())
