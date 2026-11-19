import type { Meta, StoryObj } from '@storybook/react-vite';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Skeleton } from '@/components/ui/skeleton';

/** Inputs, labels, the native select and the loading skeleton. */
const meta = {
  title: 'Components/Form controls',
  decorators: [(Story) => <div className="grid max-w-[420px] gap-4">{Story()}</div>],
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

export const TextInput: Story = {
  render: () => (
    <div className="grid gap-1.5">
      <Label htmlFor="sb-url">Link</Label>
      <Input id="sb-url" type="url" placeholder="Paste a link to save it" />
    </div>
  ),
};

export const Filled: Story = {
  render: () => (
    <div className="grid gap-1.5">
      <Label htmlFor="sb-note">Why you're saving it</Label>
      <Input id="sb-note" defaultValue="The bit about anemones closing up is lovely." />
    </div>
  ),
};

export const DisabledInput: Story = {
  render: () => (
    <div className="grid gap-1.5">
      <Label htmlFor="sb-disabled">Name</Label>
      <Input id="sb-disabled" disabled defaultValue="Sam" />
    </div>
  ),
};

export const Select: Story = {
  render: () => (
    <div className="grid gap-1.5">
      <Label htmlFor="sb-group">Share to</Label>
      <NativeSelect id="sb-group" defaultValue="a">
        <NativeSelectOption value="a">Book club</NativeSelectOption>
        <NativeSelectOption value="b">Design friends</NativeSelectOption>
      </NativeSelect>
    </div>
  ),
};

export const Checkbox: Story = {
  render: () => (
    <label className="flex items-center gap-2 text-sm font-semibold">
      <input className="size-4 accent-primary" type="checkbox" defaultChecked />I made this
    </label>
  ),
};

export const LoadingSkeleton: Story = {
  render: () => (
    <div className="grid gap-2" aria-label="Loading">
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  ),
};

/** The home page's save form, built from these controls. */
export const SaveForm: Story = {
  render: () => (
    <form className="grid gap-2.5" onSubmit={(e) => e.preventDefault()}>
      <Input type="url" name="url" placeholder="Paste a link to save it" aria-label="Link" required />
      <Input type="text" name="note" placeholder="Why you're saving it (optional)" aria-label="Note" />
      <label className="flex items-center gap-2 text-sm font-semibold">
        <input className="size-4 accent-primary" type="checkbox" name="own_work" value="1" />I made this
      </label>
      <Button type="submit">Save</Button>
    </form>
  ),
};
