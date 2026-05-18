import { STAY_OPTIONS } from "@/lib/types";

export const LOCAL_FORM_STAY_UNIT_OPTIONS = STAY_OPTIONS;

export function optionsForLocalFormSource(source?: string) {
  if (source === "stayUnits") return LOCAL_FORM_STAY_UNIT_OPTIONS;
  return [];
}
