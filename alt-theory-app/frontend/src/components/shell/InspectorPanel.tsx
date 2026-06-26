import { useState } from "react";
import { PathsPanel } from "@/components/inspector/PathsPanel";
import { ProvenancePanel } from "@/components/inspector/ProvenancePanel";
import { RecordsPanel } from "@/components/inspector/RecordsPanel";
import { RuntimePanel } from "@/components/inspector/RuntimePanel";
import { WorkspacePanel } from "@/components/inspector/WorkspacePanel";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { Tabs } from "@/components/ui/Tabs";
import { useApp } from "@/context/AppProvider";
import { showAdvancedInspectorTabs } from "@/lib/viewMode";

interface InspectorPanelProps {
  onCollapse?: () => void;
}

export function InspectorPanel({ onCollapse }: InspectorPanelProps) {
  const app = useApp();
  const advanced = showAdvancedInspectorTabs(app.viewMode, app.debugExpanded);
  const showDebugToggle = app.viewMode === "participant";
  const defaultTab = advanced ? "records" : "workspace";
  const [activeTab, setActiveTab] = useState(defaultTab);

  const tabItems = [];

  if (advanced) {
    tabItems.push({
      value: "records",
      label: "Records",
      content: (
        <RecordsPanel
          sessionId={app.sessionId}
          sessionReady={app.sessionReady}
          tabActive={activeTab === "records"}
        />
      ),
    });
  }

  tabItems.push(
    {
      value: "workspace",
      label: "Workspace",
      content: (
        <WorkspacePanel
          sessionId={app.sessionId}
          sessionReady={app.sessionReady}
          tabActive={activeTab === "workspace"}
          isRunning={app.isRunning}
          runCompletedCount={app.runCompletedCount}
          stagedWorkspacePaths={app.stagedWorkspacePaths}
          onToggleWorkspaceStage={app.toggleWorkspaceStage}
          onStageWorkspacePath={app.stageWorkspacePath}
          onUnstageWorkspacePaths={app.unstageWorkspacePaths}
          onRequestConfirm={app.requestConfirm}
          onInvokeSkill={app.invokeSkill}
        />
      ),
    },
    {
      value: "runtime",
      label: "Runtime",
      content: (
        <RuntimePanel
          sessionId={app.sessionId}
          connStatus={app.connStatus}
          connLabel={app.connLabel}
          manifest={app.manifest}
          currentDomain={app.selectors.currentDomain}
          metrics={app.metrics}
          discovery={app.discovery}
          onRefresh={() => {
            app.requestMetadata();
            app.requestMetrics();
          }}
          disabled={!app.sessionReady || !app.wsConnected}
        />
      ),
    }
  );

  if (advanced) {
    tabItems.push(
      {
        value: "provenance",
        label: "Provenance",
        content: (
          <ProvenancePanel
            sessionId={app.sessionId}
            sessionReady={app.sessionReady}
            discovery={app.discovery}
            tabActive={activeTab === "provenance"}
          />
        ),
      },
      {
        value: "paths",
        label: "Paths",
        content: <PathsPanel manifest={app.manifest} />,
      }
    );
  }

  return (
    <Panel
      className="h-full"
      bodyClassName="flex min-h-0 flex-1 flex-col p-0"
      headerActions={
        <div className="flex items-center gap-1">
          {showDebugToggle ? (
            <Button
              variant={app.debugExpanded ? "secondary" : "ghost"}
              className="min-h-8 px-2 text-[0.75rem]"
              onClick={app.toggleDebugExpanded}
              title="Show debug inspector panels for this browser"
            >
              Debug
            </Button>
          ) : null}
          {onCollapse ? (
            <Button
              variant="ghost"
              className="hidden min-h-8 px-2 lg:inline-flex"
              onClick={onCollapse}
              title="Collapse inspector"
            >
              ▶
            </Button>
          ) : null}
        </div>
      }
    >
      <Tabs
        items={tabItems}
        defaultValue={defaultTab}
        onValueChange={setActiveTab}
      />
    </Panel>
  );
}
