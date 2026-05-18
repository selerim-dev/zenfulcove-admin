import { STAY_OPTIONS } from "@/lib/types";

export const LOCAL_FORM_STAY_UNIT_OPTIONS = STAY_OPTIONS;

export const DEFAULT_LOCAL_FORM_TERMS = [
  "Rental includes paddles and life jackets.",
  "I agree to wear a life jacket at all times while using the kayak and to return the kayak to the designated storage area by the end of the rental day.",
  "I accept the cancellation policy and liability waiver. Renter assumes all risks and full responsibility for the use of the kayak and releases the Owner from any liability for injury, death, or property damage arising from its use, regardless of cause.",
  "Renter agrees to indemnify and hold the Owner harmless from any claims related to their use of the kayak.",
].join("\n\n");

export function optionsForLocalFormSource(source?: string) {
  if (source === "stayUnits") return LOCAL_FORM_STAY_UNIT_OPTIONS;
  return [];
}
