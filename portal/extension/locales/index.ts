import { registerTranslationResources } from "@nocobase/portal-sdk/i18n";
import { approvalEnUS } from "./en-US";
import { approvalZhCN } from "./zh-CN";

registerTranslationResources("app", {
  "en-US": approvalEnUS,
  "zh-CN": approvalZhCN,
});
