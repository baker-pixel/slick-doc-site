// The channel-plan rules (quota split, alternating-day placement, validation) live in one
// shared module that the scheduler and save-channel-plan edge function also use, so the
// preview a client sees is exactly what gets scheduled.
export {
  allocateCounts,
  remainingSlots,
  validateChannelPlan,
  windowQuota,
  PLAN_PLATFORMS,
  type PlacedSlot,
  type PlanInput,
} from "../../supabase/functions/_shared/channelPlan";
export { tierPolicy } from "../../supabase/functions/_shared/tierPolicy";
