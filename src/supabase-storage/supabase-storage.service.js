"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.SupabaseStorageService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const supabase_js_1 = require("@supabase/supabase-js");
const crypto_1 = require("crypto");
const path = __importStar(require("path"));
const BUCKET = 'is-fleet';
let SupabaseStorageService = class SupabaseStorageService {
    config;
    client;
    constructor(config) {
        this.config = config;
        this.client = (0, supabase_js_1.createClient)(config.getOrThrow('SUPABASE_URL'), config.getOrThrow('SUPABASE_SERVICE_ROLE_KEY'));
    }
    async uploadFile(file, folder) {
        const isImage = file.mimetype.startsWith('image/');
        const resolvedFolder = folder ?? (isImage ? 'photos' : 'documents');
        const ext = path.extname(file.originalname) || '';
        const storagePath = `${resolvedFolder}/${(0, crypto_1.randomUUID)()}${ext}`;
        const { error } = await this.client.storage
            .from(BUCKET)
            .upload(storagePath, file.buffer, {
            contentType: file.mimetype,
            upsert: false,
        });
        if (error)
            throw new Error(`Supabase upload failed: ${error.message}`);
        return { storagePath };
    }
    async uploadWithUrl(file, folder) {
        const { storagePath } = await this.uploadFile(file, folder);
        const url = await this.getSignedUrl(storagePath, 315_360_000);
        return { url, storagePath };
    }
    async deleteFile(storagePath) {
        await this.client.storage.from(BUCKET).remove([storagePath]);
    }
    async getSignedUrl(storagePath, expiresIn = 3600, download) {
        const options = download ? { download } : undefined;
        const { data, error } = await this.client.storage
            .from(BUCKET)
            .createSignedUrl(storagePath, expiresIn, options);
        if (error || !data?.signedUrl) {
            throw new Error(`Cannot create signed URL: ${error?.message}`);
        }
        return data.signedUrl;
    }
};
exports.SupabaseStorageService = SupabaseStorageService;
exports.SupabaseStorageService = SupabaseStorageService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], SupabaseStorageService);
//# sourceMappingURL=supabase-storage.service.js.map