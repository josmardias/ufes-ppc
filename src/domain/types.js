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
 * @typedef {Object} Session - one weekly meeting time (see docs/DOMAIN.md, Section)
 * @property {"Seg"|"Ter"|"Qua"|"Qui"|"Sex"|"Sáb"|"Dom"} day
 * @property {string} startTime - "HH:MM"
 * @property {string} endTime - "HH:MM"
 */

/**
 * @typedef {Object} PlannedSection
 * @property {string} id - generated, internal; stable identity for add/remove within a semester
 * @property {"offering"|"custom"} kind
 * @property {string|null} subjectCode - PPC subject code this section fulfills (may be an
 *   equivalent code the offering Section was published under, for `offering` kind); null for an
 *   unlinked Custom Section, which has no requisite effect
 * @property {string} [turma] - Section id within the Offerings snapshot (`offering` kind only)
 * @property {{name: string, sessions: Session[]}} [custom] - independent embedded copy, unaffected
 *   by later edits to the catalog entry it was applied from (`custom` kind only)
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
 * @property {Session[]} sessions
 */

/**
 * @typedef {Object} Envelope
 * @property {number} schemaVersion
 * @property {string|null} activeProfileId
 * @property {ProfileRecord[]} profiles
 */

export {};
