// The dispute reasons (disputeReasons.shared.js, generated from
// shared/disputeReasons.js) with their labels in the person's language
// (i18n "dispute.<role>.<value>"). The shared file keeps the English labels
// the server and /admin use.
import { DISPUTE_REASONS } from './disputeReasons.shared.js';
import { t } from './i18n/index.js';

export const reasonsFor = role => (DISPUTE_REASONS[role] || []).map(r => ({ value: r.value, label: t(`dispute.${role}.${r.value}`) }));

/** "Work not done", or null for a reason this role can't give. */
export const reasonLabel = (role, value) => (DISPUTE_REASONS[role]?.some(r => r.value === value) ? t(`dispute.${role}.${value}`) : null);
