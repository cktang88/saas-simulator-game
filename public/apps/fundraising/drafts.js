// Module-level drafts so re-renders (which replace inputs) never wipe what the player is typing.
export const drafts = {
  profile: {},
  outreach: {}, // invId -> text
  chat: {}, // meetingId -> text
  essays: {}, // `${program}:${i}` -> text
  grant: {},
  calc: { preMoney: 16e6, investment: 3e6, pool: 0.12, safeAmount: 500000, safeCap: 10e6, exitValue: 20e6, fees: 0.06, assumedPost: 15e6 },
  raise: {},
  stage: null,
  ir: {},
  board: {},
  redline: {}, // invId -> { marks: { clauseId: { action, value } }, note }
};
