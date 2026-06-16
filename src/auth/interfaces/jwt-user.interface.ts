export interface JwtUser {
  id: string;
  role: string;
  companyId: string;
  firstName: string;
  lastName: string | null;
}
