import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  setDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy, 
  onSnapshot,
  addDoc,
  serverTimestamp,
  getDocFromServer,
  Timestamp
} from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from './firebase.js';

// Test connection as required
export async function testConnection() {
  try {
    console.log("Testing connection...");
    await getDocFromServer(doc(db, 'test', 'connection'));
    console.log("Connection test successful (read).");
    
    if (auth.currentUser) {
      console.log("Testing write to test collection...");
      await setDoc(doc(db, 'test', auth.currentUser.uid), {
        last_test: serverTimestamp(),
        user: auth.currentUser.email
      });
      console.log("Write test successful.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
    console.error("Connection test error:", error);
  }
}

// Tenant Service
export const tenantService = {
  async getTenants() {
    try {
      const q = query(collection(db, 'tenants'), where('status', '==', 'active'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'tenants');
    }
  },
  async getTenant(id: string) {
    try {
      const docRef = doc(db, 'tenants', id);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `tenants/${id}`);
    }
  }
};

// User Service
export const userService = {
  async getUser(tenantId: string, userId: string) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'users', userId);
      const docSnap = await getDoc(docRef);
      return docSnap.exists() ? { id: docSnap.id, ...docSnap.data() } : null;
    } catch (error) {
      handleFirestoreError(error, OperationType.GET, `tenants/${tenantId}/users/${userId}`);
    }
  },
  async createUser(tenantId: string, userId: string, data: any) {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'users', userId);
      await setDoc(docRef, { ...data, created_at: serverTimestamp() });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `tenants/${tenantId}/users/${userId}`);
    }
  }
};

// Product Service
export const productService = {
  getProducts(tenantId: string, callback: (products: any[]) => void) {
    const q = query(collection(db, 'tenants', tenantId, 'products'), orderBy('created_at', 'desc'));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    }, (error) => handleFirestoreError(error, OperationType.LIST, `tenants/${tenantId}/products`));
  },
  async addProduct(tenantId: string, data: any) {
    try {
      const colRef = collection(db, 'tenants', tenantId, 'products');
      const docRef = await addDoc(colRef, { ...data, created_at: serverTimestamp() });
      return docRef.id;
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `tenants/${tenantId}/products`);
    }
  }
};
