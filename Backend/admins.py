"""Fixed list of approving authorities (admins). Only these Google accounts can sign in to the Authority Portal.

Any admin can approve / reject / hold a request that is currently with them, or forward it to any other admin.
Edit the lists below to add or remove admins (or set EXTRA_ADMIN_EMAILS in .env for quick additions).
"""

DOMAIN = "@iitrpr.ac.in"

# Demo admins - kept for now. The FIRST of these is the default first approver (override: FIRST_ADMIN_EMAIL in .env).
DEMO_ADMINS = [
    "2026csm1037@iitrpr.ac.in",
    "2026aim1020@iitrpr.ac.in",
    "2026csm1005@iitrpr.ac.in",
]

_OFFICIAL_LOCAL_PARTS = [
    "warden1.beas", "warden2.beas",
    "warden1.satluj", "warden2.satluj",
    "warden1.chenab", "warden2.chenab",
    "warden1.raavi", "warden2.raavi",
    "warden1.chintpurni", "warden2.chintpurni",
    "warden1.brahmaputra.boys", "warden2.brahmaputra.boys",
    "warden1.t6hostel",
    "chair.guesthouse",
    "deanug", "deanpg", "deansa",
    "ad.fhm",
    "registrar",  # screenshot showed registrar@iitr.ac.in - assumed typo for iitrpr.ac.in; fix here if it is really different
    "deanfaa", "ad.rnd", "deanir", "deancaps", "ad.infra", "deanceoa", "ad.hm", "jrenm",
    "hodphysics", "hodsaide", "hodchemengg", "hodchemistry", "hodce", "hodcse", "hodcbme",
    "hodelectrical", "hodhss", "hodmath", "hodme", "hodmme",
]

OFFICIAL_ADMINS = [p + DOMAIN for p in _OFFICIAL_LOCAL_PARTS]
