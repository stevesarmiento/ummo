import type { Meta, StoryObj } from "@storybook/react";
import { ScrollArea } from "./index";

const meta: Meta<typeof ScrollArea> = {
  component: ScrollArea,
  title: "Components/ScrollArea",
  tags: ["autodocs"],
};
export default meta;
type Story = StoryObj<typeof ScrollArea>;

export const Default: Story = {
  render: () => (
    <ScrollArea className="h-[200px] w-[350px] rounded-md border p-4">
      <div className="space-y-2">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="text-sm">
            Item {i + 1}
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

export const WithLongContent: Story = {
  render: () => (
    <ScrollArea className="h-[300px] w-[400px] rounded-md border p-4">
      <div className="space-y-4">
        <h4 className="text-sm font-medium">Tags</h4>
        {Array.from({ length: 50 }).map((_, i) => (
          <div key={i} className="text-sm">
            Tag {i + 1} - Lorem ipsum dolor sit amet, consectetur adipiscing elit.
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

export const Horizontal: Story = {
  render: () => (
    <ScrollArea className="w-[350px] whitespace-nowrap rounded-md border">
      <div className="flex w-max space-x-4 p-4">
        {Array.from({ length: 20 }).map((_, i) => (
          <div key={i} className="shrink-0 w-[200px] border p-4 rounded-md">
            Card {i + 1}
          </div>
        ))}
      </div>
    </ScrollArea>
  ),
};

export const InCard: Story = {
  render: () => (
    <div className="w-[400px] rounded-lg border">
      <div className="p-4 border-b">
        <h4 className="text-sm font-medium">Scrollable Content</h4>
      </div>
      <ScrollArea className="h-[200px] p-4">
        <div className="space-y-2">
          {Array.from({ length: 30 }).map((_, i) => (
            <div key={i} className="text-sm">
              Content item {i + 1}
            </div>
          ))}
        </div>
      </ScrollArea>
    </div>
  ),
};






