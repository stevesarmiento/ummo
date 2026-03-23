import type { Meta, StoryObj } from "@storybook/react";
import { Switch } from "./index";

const meta: Meta<typeof Switch> = {
  component: Switch,
  title: "Components/Switch",
  tags: ["autodocs"],
  argTypes: {
    disabled: {
      control: "boolean",
    },
    defaultChecked: {
      control: "boolean",
    },
  },
};
export default meta;
type Story = StoryObj<typeof Switch>;

export const Default: Story = {
  args: {},
};

export const Checked: Story = {
  args: {
    defaultChecked: true,
  },
};

export const Disabled: Story = {
  args: {
    disabled: true,
  },
};

export const DisabledChecked: Story = {
  args: {
    disabled: true,
    defaultChecked: true,
  },
};

export const WithLabel: Story = {
  render: () => (
    <div className="flex items-center space-x-2">
      <Switch id="airplane-mode" />
      <label htmlFor="airplane-mode" className="text-sm font-medium">
        Airplane Mode
      </label>
    </div>
  ),
};

export const SettingsExample: Story = {
  render: () => (
    <div className="space-y-4 w-[300px]">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Email notifications</p>
          <p className="text-xs text-muted-foreground">Receive emails about account activity</p>
        </div>
        <Switch defaultChecked />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Push notifications</p>
          <p className="text-xs text-muted-foreground">Receive push notifications</p>
        </div>
        <Switch />
      </div>
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Marketing emails</p>
          <p className="text-xs text-muted-foreground">Receive marketing emails</p>
        </div>
        <Switch disabled />
      </div>
    </div>
  ),
};
