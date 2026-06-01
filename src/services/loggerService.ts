import { doc, collection, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase.js';

export const loggerService = {
  /**
   * Appends an audit log entry in Firestore for standard multi-tenant operations
   */
  async appendAuditLog(
    tenantId: string,
    userId: string,
    userName: string,
    action: string,
    entityType: string,
    entityId: string,
    details: string,
    oldValues?: any,
    newValues?: any
  ): Promise<void> {
    try {
      const auditRef = doc(collection(db, 'tenants', tenantId, 'audit_logs'));
      await setDoc(auditRef, {
        user_id: userId || 'Sistema',
        user_name: userName || 'Sistema',
        action,
        entity_type: entityType,
        entity_id: entityId,
        details,
        old_values: oldValues || null,
        new_values: newValues || null,
        created_at: serverTimestamp()
      });
    } catch (err) {
      console.error("Failed to append audit log:", err);
    }
  },

  /**
   * Logs specific login and logout events
   */
  async logAuthEvent(tenantId: string, userId: string, userName: string, event: 'LOGIN' | 'LOGOUT'): Promise<void> {
    await this.appendAuditLog(
      tenantId,
      userId,
      userName,
      event,
      'User',
      userId,
      `Usuário realizou ${event === 'LOGIN' ? 'login no sistema' : 'logout do sistema'}.`
    );
  }
};
export default loggerService;
