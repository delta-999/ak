/**
 * voterData.js
 * ------------
 * This is the ONLY file you need to edit to update the voter list.
 * Add entries to the array below. With 50k+ records, keep this file
 * as the default export — it gets lazy-loaded after page paint.
 *
 * Fields:
 *   electoralNumber : number   (unique integer)
 *   rollNumber      : string   e.g. "R/18/1994"
 *   dateOfEnrolment : string   e.g. "15-02-1994"
 *   name            : string   UPPERCASE full name
 *   barAssociation  : string
 *   judgship        : string
 */

const voters = [
    {
        electoralNumber: 17901,
        rollNumber: "R/18/1994",
        dateOfEnrolment: "15-02-1994",
        name: "SH. RAKSH PAL BISHNOI",
        barAssociation: "BIKANER",
        judgship: "BIKANER"
    },
    {
        electoralNumber: 17902,
        rollNumber: "R/18/1995",
        dateOfEnrolment: "20-03-1995",
        name: "SH. RAMESH KUMAR SHARMA",
        barAssociation: "BIKANER",
        judgship: "BIKANER"
    },
    {
        electoralNumber: 17903,
        rollNumber: "R/18/1996",
        dateOfEnrolment: "10-07-1996",
        name: "SMT. SUNITA DEVI",
        barAssociation: "BIKANER",
        judgship: "BIKANER"
    },
    // ── Add your 50k+ records below this line ──
];

export default voters;