import type { Meta, StoryObj } from '@storybook/react-vite';
import { Badge, badgeVariants } from '@/components/ui/badge';

const meta = {
  title: 'Components/Badge',
  component: Badge,
  args: { children: '12' },
  argTypes: { variant: { control: 'inline-radio', options: ['default', 'chip'] } },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};
export const Tilted: Story = { args: { className: '-rotate-2' } };

/** Topic filter chips, as on the home page: quiet until current. */
export const Chips: Story = {
  render: () => (
    <nav className="flex flex-wrap gap-2" aria-label="Filter by topic">
      <a className={badgeVariants({ variant: 'chip' })} href="#all" aria-current="true">
        All · 24
      </a>
      <a className={badgeVariants({ variant: 'chip' })} href="#nature">
        Nature · 9
      </a>
      <a className={badgeVariants({ variant: 'chip' })} href="#craft">
        Craft · 6
      </a>
      <a className={badgeVariants({ variant: 'chip' })} href="#food">
        Food · 3
      </a>
    </nav>
  ),
};
