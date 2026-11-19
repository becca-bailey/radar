import type { Meta, StoryObj } from '@storybook/react-vite';
import { Alert } from '@/components/ui/alert';

const meta = {
  title: 'Components/Alert',
  component: Alert,
  args: { children: 'Saved.' },
  argTypes: { variant: { control: 'inline-radio', options: ['default', 'error'] } },
} satisfies Meta<typeof Alert>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Success: Story = {};
export const Error: Story = { args: { variant: 'error', children: "That doesn't look like a link." } };
