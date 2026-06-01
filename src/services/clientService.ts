import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  setDoc,
  query, 
  where, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase.js';
import { User, Role } from '../types.js';
import { validateCPF } from '../utils/validators.js';
import { maskCPF } from '../utils/masks.js';
import { loggerService } from './loggerService.js';

export const clientService = {
  /**
   * Subscribes to all users of a tenant
   */
  subscribeUsers(tenantId: string, callback: (users: User[]) => void) {
    const q = query(collection(db, 'tenants', tenantId, 'users'));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as User)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `tenants/${tenantId}/users`);
    });
  },

  /**
   * Fetches detailed profile of a tenant's user with their quotas, installments & consolidated products
   */
  async getUserDetails(tenantId: string, id: string, syncUserInstallments: (tId: string, uId: string) => Promise<void>) {
    try {
      // 1. Sync installments first if necessary
      await syncUserInstallments(tenantId, id);

      // 2. Read profile
      const userDoc = await getDoc(doc(db, 'tenants', tenantId, 'users', id));
      if (!userDoc.exists()) return null;

      const userData = { id: userDoc.id, ...userDoc.data() } as User;

      // 3. Read client's quotas
      const quotasRef = collection(db, 'tenants', tenantId, 'quotas');
      const quotasSnap = await getDocs(query(quotasRef, where('owner_id', '==', id)));
      const quotas = quotasSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 4. Read client's installments
      const installmentsRef = collection(db, 'tenants', tenantId, 'installments');
      const installmentsSnap = await getDocs(query(installmentsRef, where('owner_id', '==', id)));
      const installments = installmentsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

      // 5. Read all product settings to map products
      const productsSnap = await getDocs(collection(db, 'tenants', tenantId, 'products'));
      const allProducts = Object.fromEntries(productsSnap.docs.map(d => [d.id, d.data()]));

      // 6. Group quotas by product
      const productGroups: { [key: string]: any } = {};
      for (const q of quotas as any[]) {
        if (!productGroups[q.product_id]) {
          const pData = allProducts[q.product_id];
          productGroups[q.product_id] = {
            name: pData?.name || q.product_name || 'Produto',
            payment_type: pData?.payment_type || 'cash',
            quotaCount: 0,
            quotaNumbers: [],
            pendingValue: 0,
            totalValue: 0,
            installmentCount: 0
          };
        }
        productGroups[q.product_id].quotaCount++;
        productGroups[q.product_id].quotaNumbers.push(q.number);
        productGroups[q.product_id].totalValue += (q.price || 0);
      }

      // 7. Process pending installations values
      installments.forEach((inst: any) => {
        if (productGroups[inst.product_id]) {
          const qInstCount = installments.filter((i: any) => i.quota_id === inst.quota_id).length;
          productGroups[inst.product_id].installmentCount = Math.max(
            productGroups[inst.product_id].installmentCount,
            qInstCount
          );
          
          if (inst.status === 'pending') {
            productGroups[inst.product_id].pendingValue += inst.amount;
          }
        }
      });

      return {
        user: userData,
        quotas,
        installments,
        products: Object.values(productGroups)
      };
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `tenants/${tenantId}/users/${id}`);
      throw err;
    }
  },

  /**
   * Registers or updates a client (including duplicate CPF checks)
   */
  async createOrUpdateClient(
    tenantId: string,
    operatorUser: { id: string; name: string },
    clientData: { 
      id?: string;
      name: string; 
      email: string; 
      role: Role; 
      cpf: string; 
      phone?: string; 
      address?: string; 
      pix_key: string; 
    }
  ): Promise<string> {
    try {
      const usersRef = collection(db, 'tenants', tenantId, 'users');
      let targetId = clientData.id;

      // Validate CPF
      if (clientData.cpf) {
        if (!validateCPF(clientData.cpf)) {
          throw new Error('CPF inválido. Por favor, verifique os dígitos verificadores.');
        }
      }

      // Check CPF duplication
      if (clientData.cpf && !targetId) {
        const cleanCPF = clientData.cpf.replace(/\D/g, '');
        const formattedCPF = maskCPF(cleanCPF);
        const cpfQuery = query(usersRef, where('cpf', '==', formattedCPF));
        const cpfSnap = await getDocs(cpfQuery);
        
        if (!cpfSnap.empty) {
          const existingUserDoc = cpfSnap.docs[0];
          targetId = existingUserDoc.id;
          const existingData = existingUserDoc.data();
          
          await updateDoc(doc(db, 'tenants', tenantId, 'users', targetId), {
            name: clientData.name,
            phone: clientData.phone || existingData.phone || '',
            address: clientData.address || existingData.address || '',
            pix_key: clientData.pix_key || existingData.pix_key || '',
            role: clientData.role || existingData.role || 'client'
          });

          await loggerService.appendAuditLog(
            tenantId,
            operatorUser.id,
            operatorUser.name,
            'UPDATE',
            'User',
            targetId,
            `Atualizou cadastro do cliente existente via chave CPF ${formattedCPF}`,
            existingData,
            clientData
          );

          return targetId;
        }
      }

      if (targetId) {
        // Simple update
        const userRef = doc(db, 'tenants', tenantId, 'users', targetId);
        const oldSnap = await getDoc(userRef);
        const oldData = oldSnap.exists() ? oldSnap.data() : {};
        
        const updatePayload: any = {
          name: clientData.name,
          email: clientData.email,
          role: clientData.role,
          cpf: clientData.cpf ? maskCPF(clientData.cpf.replace(/\D/g, '')) : '',
          pix_key: clientData.pix_key
        };
        if (clientData.phone) updatePayload.phone = clientData.phone;
        if (clientData.address) updatePayload.address = clientData.address;

        await updateDoc(userRef, updatePayload);

        await loggerService.appendAuditLog(
          tenantId,
          operatorUser.id,
          operatorUser.name,
          'UPDATE',
          'User',
          targetId,
          `Atualizou cadastro do usuário ${clientData.name}`,
          oldData,
          updatePayload
        );
      } else {
        // Create new
        const newRef = doc(collection(db, 'tenants', tenantId, 'users'));
        targetId = newRef.id;

        const createPayload = {
          name: clientData.name,
          email: clientData.email.toLowerCase().trim(),
          role: clientData.role,
          cpf: clientData.cpf ? maskCPF(clientData.cpf.replace(/\D/g, '')) : '',
          phone: clientData.phone || '',
          address: clientData.address || '',
          pix_key: clientData.pix_key || '',
          created_at: serverTimestamp()
        };

        await setDoc(newRef, createPayload);

        await loggerService.appendAuditLog(
          tenantId,
          operatorUser.id,
          operatorUser.name,
          'CREATE',
          'User',
          targetId,
          `Cadastrou novo usuário ${clientData.name}`,
          null,
          createPayload
        );
      }

      return targetId;
    } catch (err: any) {
      handleFirestoreError(err, OperationType.WRITE, `tenants/${tenantId}/users`);
      throw err;
    }
  }
};
export default clientService;
