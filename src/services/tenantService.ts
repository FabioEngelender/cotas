import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  addDoc, 
  query, 
  where, 
  onSnapshot, 
  serverTimestamp,
  writeBatch,
  limit
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase.js';

export const tenantService = {
  /**
   * Subscribes to active tenants
   */
  subscribeActiveTenants(callback: (tenants: any[]) => void, onError?: (error: any) => void) {
    const q = query(collection(db, 'tenants'), where('status', '==', 'active'));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => {
      console.error("Error subscribing to tenants:", error);
      if (onError) onError(error);
      else handleFirestoreError(error, OperationType.LIST, 'tenants');
    });
  },

  /**
   * Fetches general active settings
   */
  subscribeTenantSettings(tenantId: string, callback: (settings: any) => void) {
    return onSnapshot(doc(db, 'tenants', tenantId, 'settings', 'general'), (doc) => {
      if (doc.exists()) {
        callback(doc.data());
      }
    }, (error) => {
      console.error("Error fetching settings:", error);
    });
  },

  /**
   * Soft deletes a tenant
   */
  async deleteTenant(id: string): Promise<void> {
    try {
      await updateDoc(doc(db, 'tenants', id), { status: 'deleted' });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tenants/${id}`);
    }
  },

  /**
   * Registers a new tenant and sets up defaults (settings, master owner)
   */
  async createTenant(name: string, cnpj: string, imageUrl: string = '', ownerUid: string | null = null, ownerEmail: string | null = null, ownerName: string | null = null): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, 'tenants'), {
        name,
        cnpj,
        image_url: imageUrl,
        status: 'active',
        created_at: serverTimestamp(),
        owner_uid: ownerUid
      });
      
      // Default settings
      await setDoc(doc(db, 'tenants', docRef.id, 'settings', 'general'), {
        app_name: name,
        retention_percent: 10,
        quota_prefix: 'COTA-'
      });

      // Default term template
      await setDoc(doc(collection(db, 'tenants', docRef.id, 'terms')), {
        title: 'Termo de Adesão Geral',
        content: `Este termo rege as condições gerais de aquisição de cotas do produto para ${name}.`,
        is_active: true,
        created_at: serverTimestamp(),
        version: 1
      });

      // Create owner user details in tenant if requested
      if (ownerUid && ownerEmail) {
        await setDoc(doc(db, 'tenants', docRef.id, 'users', ownerUid), {
          name: ownerName || 'Admin',
          email: ownerEmail,
          role: 'admin',
          tenant_id: docRef.id,
          created_at: serverTimestamp()
        });
      }

      return docRef.id;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'tenants');
      throw err;
    }
  },

  /**
   * Runs recurring system defaults (cleanup logs, recurrent payments check)
   */
  async runRecurringDefaults(tenantId: string) {
    try {
      // 1. Recurrent defaults
      const now = new Date();
      now.setHours(23, 59, 59, 999);
      
      const installmentsRef = collection(db, 'tenants', tenantId, 'installments');
      const q = query(
        installmentsRef, 
        where('status', '==', 'pending'),
        where('due_date', '<', now.toISOString().split('T')[0])
      );
      
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const batch = writeBatch(db);
        const processedQuotas = new Set<string>();
        
        for (const installmentDoc of snapshot.docs) {
          const data = installmentDoc.data();
          const productRef = doc(db, 'tenants', tenantId, 'products', data.product_id);
          const productSnap = await getDoc(productRef);
          
          if (productSnap.exists() && productSnap.data().payment_type === 'recurrent') {
            const quotaId = data.quota_id;
            if (processedQuotas.has(quotaId)) continue;
            processedQuotas.add(quotaId);
            
            const quotaRef = doc(db, 'tenants', tenantId, 'quotas', quotaId);
            batch.update(quotaRef, {
              status: 'defaulted'
            });
            
            const futureQ = query(
              installmentsRef,
              where('quota_id', '==', quotaId),
              where('status', '==', 'pending')
            );
            const futureSnapshot = await getDocs(futureQ);
            futureSnapshot.docs.forEach(d => {
              batch.delete(d.ref);
            });
            
            const logRef = doc(collection(db, 'tenants', tenantId, 'logs'));
            batch.set(logRef, {
              action: 'AUTO_REMOVAL',
              details: `Cliente ${data.owner_name} removido por inadimplência no produto ${data.product_name} (Cota ${data.quota_number})`,
              userId: 'system',
              createdAt: serverTimestamp()
            });
          }
        }
        await batch.commit();
      }

      // 2. Cleanup Old Logs (pre-750 days)
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 750);
      
      const logsQ = query(
        collection(db, 'tenants', tenantId, 'audit_logs'), 
        where('created_at', '<', cutoff),
        limit(100)
      );
      
      const logsSnap = await getDocs(logsQ);
      if (!logsSnap.empty) {
        const batch = writeBatch(db);
        logsSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      // 3. Scan Orphaned Installments
      const orphanedQ = query(installmentsRef, where('status', '==', 'pending'), limit(20));
      const orphanedSnap = await getDocs(orphanedQ);
      
      if (!orphanedSnap.empty) {
        const batch = writeBatch(db);
        let changed = false;
        
        for (const instDoc of orphanedSnap.docs) {
          const data = instDoc.data();
          if (data.owner_id) {
            const userRef = doc(db, 'tenants', tenantId, 'users', data.owner_id);
            const userSnap = await getDoc(userRef);
            if (!userSnap.exists()) {
              batch.delete(instDoc.ref);
              changed = true;
            }
          }
        }
        
        if (changed) {
          await batch.commit();
        }
      }
    } catch (err) {
      console.error("Error running recurring defaults:", err);
    }
  }
};
export default tenantService;
