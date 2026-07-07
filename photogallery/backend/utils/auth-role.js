function normalizeRole(value) {
    if (typeof value !== 'string') return '';
    const trimmed = value.trim().toLowerCase();
    return trimmed;
}

function resolveAccountRole(decoded, fallbackRole = 'photographer') {
    if (!decoded || typeof decoded !== 'object') {
        return fallbackRole;
    }

    const directRole = normalizeRole(decoded.role);
    if (directRole) return directRole;

    const claimsRole = normalizeRole(decoded.claims && decoded.claims.role);
    if (claimsRole) return claimsRole;

    if (typeof decoded.email === 'string' && decoded.email.trim().toLowerCase() === 'admin@photogallery.com') {
        return 'admin';
    }

    return fallbackRole;
}

module.exports = {
    resolveAccountRole,
};