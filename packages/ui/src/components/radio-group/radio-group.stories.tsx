import type { Meta, StoryObj } from "@storybook/react";
import { RadioGroup, RadioGroupItem } from "./index";
import { Label } from "../label";

const meta: Meta<typeof RadioGroup> = {
  component: RadioGroup,
  title: "Components/RadioGroup",
  tags: ["autodocs"],
};
export default meta;
type Story = StoryObj<typeof RadioGroup>;

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="comfortable">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="default" id="r1" />
        <Label htmlFor="r1">Default</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="comfortable" id="r2" />
        <Label htmlFor="r2">Comfortable</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="compact" id="r3" />
        <Label htmlFor="r3">Compact</Label>
      </div>
    </RadioGroup>
  ),
};

export const Horizontal: Story = {
  render: () => (
    <RadioGroup defaultValue="option-one" className="flex gap-6">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-one" id="h1" />
        <Label htmlFor="h1">Option One</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-two" id="h2" />
        <Label htmlFor="h2">Option Two</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-three" id="h3" />
        <Label htmlFor="h3">Option Three</Label>
      </div>
    </RadioGroup>
  ),
};

export const WithDisabled: Story = {
  render: () => (
    <RadioGroup defaultValue="option-one">
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-one" id="d1" />
        <Label htmlFor="d1">Option One</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-two" id="d2" disabled />
        <Label htmlFor="d2" className="text-muted-foreground">Option Two (disabled)</Label>
      </div>
      <div className="flex items-center space-x-2">
        <RadioGroupItem value="option-three" id="d3" />
        <Label htmlFor="d3">Option Three</Label>
      </div>
    </RadioGroup>
  ),
};

export const CardLayout: Story = {
  render: () => (
    <RadioGroup defaultValue="card" className="grid grid-cols-3 gap-4">
      <div>
        <RadioGroupItem value="card" id="card" className="peer sr-only" />
        <Label
          htmlFor="card"
          className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
        >
          Card
        </Label>
      </div>
      <div>
        <RadioGroupItem value="paypal" id="paypal" className="peer sr-only" />
        <Label
          htmlFor="paypal"
          className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
        >
          PayPal
        </Label>
      </div>
      <div>
        <RadioGroupItem value="apple" id="apple" className="peer sr-only" />
        <Label
          htmlFor="apple"
          className="flex flex-col items-center justify-between rounded-md border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary [&:has([data-state=checked])]:border-primary"
        >
          Apple
        </Label>
      </div>
    </RadioGroup>
  ),
};






