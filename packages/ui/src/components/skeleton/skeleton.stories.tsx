import type { Meta, StoryObj } from "@storybook/react";
import { Skeleton } from "./index";

const meta: Meta<typeof Skeleton> = {
  component: Skeleton,
  title: "Components/Skeleton",
  tags: ["autodocs"],
};
export default meta;
type Story = StoryObj<typeof Skeleton>;

export const Default: Story = {
  render: () => <Skeleton className="h-4 w-[250px]" />,
};

export const Circle: Story = {
  render: () => <Skeleton className="h-12 w-12 rounded-full" />,
};

export const Card: Story = {
  render: () => (
    <div className="flex items-center space-x-4 w-[400px]">
      <Skeleton className="h-12 w-12 rounded-full" />
      <div className="space-y-2 flex-1">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
      </div>
    </div>
  ),
};

export const Article: Story = {
  render: () => (
    <div className="w-[500px] space-y-4">
      <Skeleton className="h-8 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-[200px] w-full rounded-lg" />
    </div>
  ),
};






