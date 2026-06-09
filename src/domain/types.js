// Canonical persisted data shapes, documented as JSDoc typedefs (see
// docs/ARCHITECTURE.md, "Language and types" and "Persistence"). These are
// documentation-grade: editors get autocomplete/hover docs, but nothing here
// is enforced at runtime. Runtime safety lives in domain validation
// functions and the storage layer.

/**
 * @typedef {Object} ProfileRecord
 * @property {string} id - generated, internal — never taken from imports
 * @property {string} name
 * @property {string|null} ppcId
 * @property {number} ingressYear
 * @property {1|2} ingressYearSemester
 * @property {"day"|"morning"|"afternoon"} shift
 * @property {"morning"|"afternoon"|"day"|null} shiftFilter
 * @property {PlannedSemester[]} semesters
 * @property {CreditEntry[]} creditEntries
 * @property {CustomSection[]} customSections
 */

/**
 * @typedef {Object} PlannedSemester
 * @property {PlannedSection[]} sections
 */

/**
 * @typedef {Object} PlannedSection
 * @property {string} subjectCode - code the section was offered under (may be an equivalent)
 * @property {boolean} failed - Failed Mark (see docs/DOMAIN.md)
 * @property {boolean} audit - Audit Mark (see docs/DOMAIN.md)
 */

/**
 * @typedef {Object} CreditEntry
 * @property {string} subjectCode
 * @property {boolean} audit
 */

/**
 * @typedef {Object} CustomSection
 * @property {string} id
 * @property {string} name
 * @property {1|2|"both"} applicability - which Year Semester(s) it applies to
 * @property {string|null} subjectCode - optional Subject link
 */

/**
 * @typedef {Object} Envelope
 * @property {number} schemaVersion
 * @property {string|null} activeProfileId
 * @property {ProfileRecord[]} profiles
 */

export {};
