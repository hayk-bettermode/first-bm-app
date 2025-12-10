export enum ConditionTimeWindowEnum {
  TODAY = "TODAY",
  THIS_WEEK = "THIS_WEEK",
  THIS_MONTH = "THIS_MONTH", // We are loading posts for the last 31 days max as set in the constants
  LAST_N_DAYS = "LAST_N_DAYS",
}