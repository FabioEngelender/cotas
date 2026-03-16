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
import { db, auth } from './firebase.js';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Test connection as required
export async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error("Please check your Firebase configuration.");
    }
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
