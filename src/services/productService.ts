import { 
  collection, 
  doc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  orderBy, 
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../firebase.js';
import { Product } from '../types.js';
import { loggerService } from './loggerService.js';

export const productService = {
  /**
   * Subscribes to all active products in descending order of creation
   */
  subscribeProducts(tenantId: string, callback: (products: Product[]) => void) {
    const q = query(collection(db, 'tenants', tenantId, 'products'), orderBy('created_at', 'desc'));
    return onSnapshot(q, (snapshot) => {
      callback(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, `tenants/${tenantId}/products`);
    });
  },

  /**
   * Fetches a single product by ID
   */
  async getProduct(tenantId: string, productId: string): Promise<Product | null> {
    try {
      const docSnap = await getDoc(doc(db, 'tenants', tenantId, 'products', productId));
      return docSnap.exists() ? ({ id: docSnap.id, ...docSnap.data() } as Product) : null;
    } catch (err) {
      handleFirestoreError(err, OperationType.GET, `tenants/${tenantId}/products/${productId}`);
      throw err;
    }
  },

  /**
   * Creates a new product
   */
  async createProduct(
    tenantId: string,
    operatorUser: { id: string; name: string },
    productPayload: Omit<Product, 'id' | 'created_at'>
  ): Promise<string> {
    try {
      const docRef = await addDoc(collection(db, 'tenants', tenantId, 'products'), {
        ...productPayload,
        created_at: serverTimestamp(),
      });

      await loggerService.appendAuditLog(
        tenantId,
        operatorUser.id,
        operatorUser.name,
        'CREATE',
        'Product',
        docRef.id,
        `Criou novo produto ${productPayload.name}`,
        null,
        productPayload
      );

      return docRef.id;
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `tenants/${tenantId}/products`);
      throw err;
    }
  },

  /**
   * Updates an existing product
   */
  async updateProduct(
    tenantId: string,
    operatorUser: { id: string; name: string },
    productId: string,
    productPayload: Partial<Product>
  ): Promise<void> {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'products', productId);
      const oldSnap = await getDoc(docRef);
      const oldData = oldSnap.exists() ? oldSnap.data() : {};

      await updateDoc(docRef, productPayload);

      await loggerService.appendAuditLog(
        tenantId,
        operatorUser.id,
        operatorUser.name,
        'UPDATE',
        'Product',
        productId,
        `Atualizou produto ${productPayload.name || oldData.name || productId}`,
        oldData,
        productPayload
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `tenants/${tenantId}/products/${productId}`);
      throw err;
    }
  },

  /**
   * Deletes a product
   */
  async deleteProduct(
    tenantId: string,
    operatorUser: { id: string; name: string },
    productId: string
  ): Promise<void> {
    try {
      const docRef = doc(db, 'tenants', tenantId, 'products', productId);
      const snap = await getDoc(docRef);
      const data = snap.exists() ? snap.data() : {};

      await deleteDoc(docRef);

      await loggerService.appendAuditLog(
        tenantId,
        operatorUser.id,
        operatorUser.name,
        'DELETE',
        'Product',
        productId,
        `Excluiu produto ${data.name || productId}`,
        data,
        null
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `tenants/${tenantId}/products/${productId}`);
      throw err;
    }
  }
};
export default productService;
