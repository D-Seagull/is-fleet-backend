"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.normalizePhone = normalizePhone;
function normalizePhone(input) {
    if (typeof input !== 'string')
        return null;
    const cleaned = input.replace(/[^\d+]/g, '');
    const withPlus = cleaned.startsWith('+') ? cleaned : `+${cleaned}`;
    if (!/^\+\d{8,16}$/.test(withPlus))
        return null;
    return withPlus;
}
//# sourceMappingURL=phone.js.map