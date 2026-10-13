/* Single source of truth for the lists the front end used to hard-code. */

const REQUEST_TYPES = {
  facetoface:   { label: 'Face to face',                                   group: 'session',  code: 'FF', evidence: 'photo' },
  academic:     { label: 'Academic',                                       group: 'session',  code: 'AC', evidence: 'photo' },
  followup:     { label: 'Follow up',                                      group: 'session',  code: 'FU', evidence: 'photo' },
  peer:         { label: 'Peer support session',                           group: 'session',  code: 'PS', evidence: 'photo' },
  online:       { label: 'Online counseling',                              group: 'session',  code: 'OL', evidence: 'screenshot' },
  goodmoral:    { label: 'Good moral certificate',                         group: 'document', code: 'GM', evidence: null },
  returning:    { label: 'Academic counseling \u2014 returning student',   group: 'document', code: 'RS', evidence: null },
  failing:      { label: 'Academic counseling \u2014 last semester',       group: 'document', code: 'LS', evidence: null },
  exittransfer: { label: 'Exit interview \u2014 transfer / shift / drop',  group: 'document', code: 'ET', evidence: null },
  exitgrad:     { label: 'Exit interview \u2014 graduating',               group: 'document', code: 'EG', evidence: null }
};

module.exports = {
  REQUEST_TYPES,
  REQUEST_STATUSES: ['pending', 'scheduled', 'done'],
  PERMISSION_SECTIONS: ['requests', 'peers', 'live', 'evaluations', 'programs', 'holidays', 'accounts'],
  PROGRAM_LEVELS: ['Undergraduate', 'Post-graduate', 'Graduate'],
  YEAR_LEVELS: ['1st year', '2nd year', '3rd year', '4th year', '5th year'],
  HOLIDAY_TYPES: ['Regular holiday', 'Special non-working day', 'Local holiday', 'Office closure'],
  EMAIL_DOMAIN: '@bpsu.edu.ph'
};
