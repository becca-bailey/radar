import type { Meta, StoryObj } from '@storybook/react-vite';
import SaveMenu from '@/components/SaveMenu';
import UserMenu from '@/components/UserMenu';
import GroupMenu from '@/components/GroupMenu';
import InviteLink from '@/components/InviteLink';
import OwnerPanel from '@/components/OwnerPanel';
import { GROUPS, SAVES } from '../fixtures';

/**
 * Radar's own React islands, live: menus open and dialogs work. Their forms
 * post to the app's routes, which don't exist in Storybook, so submitting
 * does nothing useful.
 */
const meta = {
  title: 'Radar/Menus and panels',
  parameters: { layout: 'centered' },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const SaveActions: Story = {
  name: 'Save menu',
  render: () => (
    <SaveMenu
      saveId={SAVES.shared.id}
      title={SAVES.shared.links!.title!}
      url={SAVES.shared.links!.canonical_url}
      note={SAVES.shared.note}
      readerHref={`/saves/${SAVES.shared.id}`}
      canRetry={false}
      sharedIn={[GROUPS[0].name]}
      shareTo={[GROUPS[1]]}
      defaultGroupId={GROUPS[1].id}
    />
  ),
};

export const Account: Story = {
  name: 'User menu',
  render: () => <UserMenu email="sam@example.com" />,
};

export const Group: Story = {
  name: 'Group menu (owner)',
  render: () => (
    <GroupMenu
      name={GROUPS[0].name}
      home={`/groups/${GROUPS[0].id}`}
      myName="Sam"
      returnPath={`/groups/${GROUPS[0].id}`}
      isOwner
      invite={{ url: 'https://onyourradar.app/join/sample', status: '4 members · 1 joined this week' }}
      removedCount={1}
    />
  ),
};

export const Owner: Story = {
  name: 'Owner panel with invite link',
  parameters: { layout: 'padded' },
  render: () => (
    <div className="max-w-[628px]">
      <OwnerPanel title="Invite people">
        <InviteLink
          url="https://onyourradar.app/join/sample"
          action={`/groups/${GROUPS[0].id}`}
          status="4 members · 1 joined this week"
        />
      </OwnerPanel>
    </div>
  ),
};
