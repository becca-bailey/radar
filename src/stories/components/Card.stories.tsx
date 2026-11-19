import type { Meta, StoryObj } from '@storybook/react-vite';
import { MoreHorizontalIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

const meta = {
  title: 'Components/Card',
  component: Card,
  decorators: [(Story) => <div className="max-w-[628px]">{Story()}</div>],
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>How tidepools survive the tide going out</CardTitle>
        <CardDescription>Field Notes · Yesterday</CardDescription>
        <CardAction>
          <Button variant="ghost" size="icon" aria-label="Actions">
            <MoreHorizontalIcon />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>
        <p className="m-0">The pool survives by doing less.</p>
      </CardContent>
      <CardFooter>
        <Button size="sm" variant="outline">
          Share
        </Button>
      </CardFooter>
    </Card>
  ),
};

export const TitleOnly: Story = {
  render: () => (
    <Card>
      <CardHeader>
        <CardTitle>Just a title</CardTitle>
      </CardHeader>
    </Card>
  ),
};
