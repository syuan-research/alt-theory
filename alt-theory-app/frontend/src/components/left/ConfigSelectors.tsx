import { useApp } from "@/context/AppProvider";
import { FieldFrame, Select } from "@/components/ui/Field";
import { NONE_VALUE } from "@/lib/constants";
import { showAdvancedConfig } from "@/lib/viewMode";

function slugFromSelect(value: string): string | null {
  return value && value !== NONE_VALUE ? value : null;
}

export function ConfigSelectors() {
  const app = useApp();
  const advanced = showAdvancedConfig(app.viewMode);
  const discovery = app.discovery;
  const interactive = app.sessionReady && app.wsConnected && !app.isRunning;
  const selectors = app.selectors;

  if (!advanced) {
    return null;
  }

  return (
    <div className="space-y-3">
      <p className="text-[0.75rem] font-semibold uppercase tracking-wide text-text-secondary">
        Launch / Config
      </p>

      <FieldFrame label="Project">
        <Select
          disabled={!interactive || !discovery}
          value={selectors.projectId || NONE_VALUE}
          onChange={(event) =>
            app.switchProject(slugFromSelect(event.target.value))
          }
        >
          <option value={NONE_VALUE}>Unassigned</option>
          {(discovery?.projects ?? []).map((project) => (
            <option key={project.projectId} value={project.projectId}>
              {project.displayName}
            </option>
          ))}
        </Select>
      </FieldFrame>

      <FieldFrame label="Soul">
        <Select
          disabled={!interactive || !discovery}
          value={selectors.soulSlug || NONE_VALUE}
          onChange={(event) =>
            app.switchSoul(slugFromSelect(event.target.value))
          }
        >
          <option value={NONE_VALUE}>None</option>
          {(discovery?.souls ?? []).map((soul) => (
            <option key={soul.slug} value={soul.slug}>
              {soul.displayName}
            </option>
          ))}
        </Select>
      </FieldFrame>

      <FieldFrame label="Role">
        <Select
          disabled={!interactive || !discovery}
          value={selectors.rolePresetSlug || NONE_VALUE}
          onChange={(event) =>
            app.switchRolePreset(slugFromSelect(event.target.value))
          }
        >
          <option value={NONE_VALUE}>None</option>
          {(discovery?.rolePresets ?? []).map((preset) => (
            <option key={preset.slug} value={preset.slug}>
              {preset.displayName}
            </option>
          ))}
        </Select>
      </FieldFrame>

      <FieldFrame label="Instruction">
        <Select
          disabled={!interactive || !discovery}
          value={selectors.customInstructionRef || NONE_VALUE}
          onChange={(event) =>
            app.switchInstruction(slugFromSelect(event.target.value))
          }
        >
          <option value={NONE_VALUE}>None</option>
          {(discovery?.instructions ?? []).map((instruction) => (
            <option key={instruction.ref} value={instruction.ref}>
              {instruction.displayName}
            </option>
          ))}
        </Select>
      </FieldFrame>
    </div>
  );
}
