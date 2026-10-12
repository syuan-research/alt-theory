import { useApp } from "@/context/AppProvider";
import { useConversationContext } from "@/context/ConversationContext";
import { PendingMark } from "@/components/ui/PendingMark";
import { modelReferenceLabel, useApprovalReviewer } from "@/lib/approvalReviewer";
import { PERMISSIONS, PERMISSION_DETAIL, PERMISSION_ICON, PERMISSION_LABEL, fullAccessConsequences } from "@/lib/permission";
import { t } from "@/i18n";

/** The permission of the conversation shown in this composer. */
export function PermissionChip({ open, onToggle, onClose }: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
}) {
  const app = useApp();
  const conv = useConversationContext();
  const reviewer = useApprovalReviewer();
  return (
    <span className="perm-anchor">
      <button
        className={`flat${conv.permission === "full" ? " perm-on" : ""}`}
        data-tip={t("Permission: {name}", { name: PERMISSION_LABEL[conv.permission]() })}
        onClick={(event) => {
          event.stopPropagation();
          onToggle();
        }}
      >
        <i className={`ph ${PERMISSION_ICON[conv.permission]}`} />
        <span className="perm-label">{PERMISSION_LABEL[conv.permission]()}</span>
        <PendingMark when={conv.pendingChanges.fullAccess !== undefined || conv.pendingChanges.mode !== undefined} />
      </button>
      <div className={`menu${open ? " on" : ""}`} onClick={(event) => event.stopPropagation()}>
        {PERMISSIONS.map((permission) => (
          <div
            key={permission}
            className="mi"
            onClick={() => {
              onClose();
              if (permission === conv.permission) return;
              // Full goes through the standard confirm window; lowering is immediate.
              if (permission !== "full") {
                conv.setPermission(permission);
                return;
              }
              app.requestConfirm({
                message: t("Enable full access?"),
                details: fullAccessConsequences(),
                confirmLabel: t("Enable full access"),
                onConfirm: () => conv.setPermission("full"),
              });
            }}
          >
            <i className={`ph ${PERMISSION_ICON[permission]}${permission === "full" ? " perm-warn-icon" : ""}`} />
            <span>
              {PERMISSION_LABEL[permission]()}
              {permission === "smart" ? <span className="exp-tag">{t("Experimental")}</span> : null}
              <span className="d">{PERMISSION_DETAIL[permission]()}</span>
              {permission === "smart" ? (
                <span className="d">
                  {reviewer?.reviewer
                    ? t("Reviews with {model}", { model: modelReferenceLabel(reviewer.reviewer.model) })
                    : t("Reviews with this conversation's model at low thinking; each review is an extra call to it")}
                </span>
              ) : null}
            </span>
            {conv.permission === permission ? <i className="ph ph-check check" /> : null}
          </div>
        ))}
      </div>
    </span>
  );
}
