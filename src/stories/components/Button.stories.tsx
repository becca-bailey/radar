import type { Meta, StoryObj } from '@storybook/react-vite';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

const meta = {
  title: 'Components/Button',
  component: Button,
  args: { children: 'Save link' },
  argTypes: {
    variant: { control: 'inline-radio', options: ['default', 'outline', 'destructive', 'ghost'] },
    size: { control: 'inline-radio', options: ['default', 'sm', 'icon'] },
  },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Outline: Story = { args: { variant: 'outline', children: 'Cancel' } };
export const Destructive: Story = { args: { variant: 'destructive', children: 'Delete' } };
export const Ghost: Story = { args: { variant: 'ghost', children: 'More' } };
export const Small: Story = { args: { size: 'sm' } };
export const Icon: Story = { args: { size: 'icon', children: <PlusIcon />, 'aria-label': 'Add' } };
export const Disabled: Story = { args: { disabled: true } };

/** Every variant and size together, for checking a theme at a glance. */
export const All: Story = {
  render: () => (
    <div className="flex flex-col gap-4">
      {(['default', 'sm'] as const).map((size) => (
        <div key={size} className="flex flex-wrap items-center gap-3">
          <Button size={size}>Save link</Button>
          <Button size={size} variant="outline">
            Cancel
          </Button>
          <Button size={size} variant="destructive">
            Delete
          </Button>
          <Button size={size} variant="ghost">
            More
          </Button>
        </div>
      ))}
    </div>
  ),
};
