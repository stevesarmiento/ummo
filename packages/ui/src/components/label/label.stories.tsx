import type { Meta, StoryObj } from "@storybook/react";
import { Label } from "./index";
import { Input } from "../input";
import { Checkbox } from "../checkbox";

const meta: Meta<typeof Label> = {
  component: Label,
  title: "Components/Label",
  tags: ["autodocs"],
};
export default meta;
type Story = StoryObj<typeof Label>;

export const Default: Story = {
  render: () => (
    <div className="space-y-2">
      <Label htmlFor="email">Email</Label>
      <Input id="email" type="email" placeholder="name@example.com" />
    </div>
  ),
};

export const WithCheckbox: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Checkbox id="terms" />
      <Label htmlFor="terms">Accept terms and conditions</Label>
    </div>
  ),
};

export const Required: Story = {
  render: () => (
    <div className="space-y-2">
      <Label htmlFor="username">
        Username <span className="text-destructive">*</span>
      </Label>
      <Input id="username" placeholder="johndoe" required />
    </div>
  ),
};

export const Disabled: Story = {
  render: () => (
    <div className="space-y-2">
      <Label htmlFor="disabled-input" className="peer-disabled:opacity-70">
        Disabled Input
      </Label>
      <Input id="disabled-input" disabled placeholder="Cannot type here" />
    </div>
  ),
};






