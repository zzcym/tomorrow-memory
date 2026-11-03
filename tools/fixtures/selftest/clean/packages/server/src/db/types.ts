export interface AppDB {
  createUser(id: string, hash: string): Promise<void>;
  activateUser(id: string, hash: string): Promise<void>;
  changePassword(id: string, oldHash: string, newHash: string): Promise<void>;
}
