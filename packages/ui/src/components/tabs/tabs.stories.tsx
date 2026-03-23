import type { Meta, StoryObj } from "@storybook/react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./index";

const meta: Meta<typeof Tabs> = {
  component: Tabs,
  title: "Components/Tabs",
  tags: ["autodocs"],
};
export default meta;
type Story = StoryObj<typeof Tabs>;

export const Default: Story = {
  render: () => (
    <Tabs defaultValue="account" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="account">Account</TabsTrigger>
        <TabsTrigger value="password">Password</TabsTrigger>
      </TabsList>
      <TabsContent value="account">
        <div className="p-4 border rounded-md mt-2">
          <h3 className="font-medium">Account Settings</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Make changes to your account here.
          </p>
        </div>
      </TabsContent>
      <TabsContent value="password">
        <div className="p-4 border rounded-md mt-2">
          <h3 className="font-medium">Password Settings</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Change your password here.
          </p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};

export const MultipleTabs: Story = {
  render: () => (
    <Tabs defaultValue="overview" className="w-[500px]">
      <TabsList>
        <TabsTrigger value="overview">Overview</TabsTrigger>
        <TabsTrigger value="analytics">Analytics</TabsTrigger>
        <TabsTrigger value="reports">Reports</TabsTrigger>
        <TabsTrigger value="notifications">Notifications</TabsTrigger>
      </TabsList>
      <TabsContent value="overview">
        <div className="p-4 border rounded-md mt-2">
          <p className="text-sm">Overview content goes here.</p>
        </div>
      </TabsContent>
      <TabsContent value="analytics">
        <div className="p-4 border rounded-md mt-2">
          <p className="text-sm">Analytics content goes here.</p>
        </div>
      </TabsContent>
      <TabsContent value="reports">
        <div className="p-4 border rounded-md mt-2">
          <p className="text-sm">Reports content goes here.</p>
        </div>
      </TabsContent>
      <TabsContent value="notifications">
        <div className="p-4 border rounded-md mt-2">
          <p className="text-sm">Notifications content goes here.</p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};

export const DisabledTab: Story = {
  render: () => (
    <Tabs defaultValue="tab1" className="w-[400px]">
      <TabsList>
        <TabsTrigger value="tab1">Tab 1</TabsTrigger>
        <TabsTrigger value="tab2" disabled>
          Tab 2 (disabled)
        </TabsTrigger>
        <TabsTrigger value="tab3">Tab 3</TabsTrigger>
      </TabsList>
      <TabsContent value="tab1">
        <div className="p-4 border rounded-md mt-2">
          <p className="text-sm">Content for Tab 1</p>
        </div>
      </TabsContent>
      <TabsContent value="tab3">
        <div className="p-4 border rounded-md mt-2">
          <p className="text-sm">Content for Tab 3</p>
        </div>
      </TabsContent>
    </Tabs>
  ),
};
