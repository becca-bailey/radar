#!/usr/bin/env python3
"""Build and sign the "Put it on Radar" iOS Shortcut.

Produces public/radar.shortcut (signed, importable on iOS 15+/macOS 12+).
Signing uses the macOS `shortcuts` CLI, so this must run on a Mac:

    python3 scripts/make-shortcut.py

The shortcut accepts a page from the share sheet, extracts the URL, and
POSTs it to /api/saves with a Bearer token. The token is an import
question: the Shortcuts app asks the person to paste theirs when they
first set up the shortcut, and our placeholder value is stripped from
the shared file.
"""

import plistlib
import subprocess
import sys
import tempfile
import uuid
from pathlib import Path

SITE = "https://radar-saves.netlify.app"

# U+FFFC marks where Shortcuts splices an attachment into a string.
ATTACH = "￼"

UUID_TOKEN = str(uuid.uuid4()).upper()
UUID_LINKS = str(uuid.uuid4()).upper()
UUID_FIRST = str(uuid.uuid4()).upper()
UUID_RESP = str(uuid.uuid4()).upper()
UUID_MSG = str(uuid.uuid4()).upper()


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
            # The input must be the Shortcut Input magic variable,
            # serialized as an aggrandizement-free attachment wrapped
            # TWICE (parameter -> variable -> attachment). A single
            # wrap, and the implicit-first-action form, both imported
            # as an unresolved "Input" and produced empty URLs.
            "WFWorkflowActionIdentifier": "is.workflow.actions.detect.link",
            "WFWorkflowActionParameters": {
                "UUID": UUID_LINKS,
                "WFInput": {
                    "WFSerializationType": "WFTextTokenAttachment",
                    "Value": {
                        "WFSerializationType": "WFTextTokenAttachment",
                        "Value": {"Type": "ExtensionInput"},
                    },
                },
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
            "WFWorkflowActionIdentifier": "is.workflow.actions.downloadurl",
            "WFWorkflowActionParameters": {
                "UUID": UUID_RESP,
                "WFURL": f"{SITE}/api/saves",
                "WFHTTPMethod": "POST",
                "ShowHeaders": True,
                "WFHTTPHeaders": dictionary_field(
                    [
                        text_item(
                            "Authorization",
                            text_token(
                                f"Bearer {ATTACH}",
                                {
                                    "{7, 1}": {
                                        "Type": "ActionOutput",
                                        "OutputUUID": UUID_TOKEN,
                                        "OutputName": "Radar API Token",
                                    }
                                },
                            ),
                        )
                    ]
                ),
                "WFHTTPBodyType": "JSON",
                "WFJSONValues": dictionary_field(
                    [
                        text_item(
                            "url",
                            text_token(
                                ATTACH,
                                {
                                    "{0, 1}": {
                                        "Type": "ActionOutput",
                                        "OutputUUID": UUID_FIRST,
                                        "OutputName": "Item from List",
                                    }
                                },
                            ),
                        )
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
