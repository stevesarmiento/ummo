import type { Meta, StoryObj } from "@storybook/react";
import { Progress } from "./index";

const meta: Meta<typeof Progress> = {
  component: Progress,
  title: "Components/Progress",
  tags: ["autodocs"],
  argTypes: {
    value: {
      control: { type: "range", min: 0, max: 100, step: 1 },
    },
  },
};
export default meta;
type Story = StoryObj<typeof Progress>;

export const Default: Story = {
  args: {
    value: 33,
  },
};

export const Half: Story = {
  args: {
    value: 50,
  },
};

export const Complete: Story = {
  args: {
    value: 100,
  },
};

export const Zero: Story = {
  args: {
    value: 0,
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="space-y-4 w-[400px]">
      <div className="space-y-2">
        <p className="text-sm font-medium">Thin</p>
        <Progress value={33} className="h-1" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Default</p>
        <Progress value={50} className="h-2" />
      </div>
      <div className="space-y-2">
        <p className="text-sm font-medium">Thick</p>
        <Progress value={75} className="h-4" />
      </div>
    </div>
  ),
};

export const WithLabel: Story = {
  render: () => (
    <div className="space-y-2 w-[400px]">
      <div className="flex justify-between text-sm">
        <span>Upload progress</span>
        <span>66%</span>
      </div>
      <Progress value={66} />
    </div>
  ),
};






