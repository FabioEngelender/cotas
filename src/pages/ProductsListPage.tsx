import * as React from 'react';
import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { 
  collection, 
  query, 
  orderBy, 
  onSnapshot, 
  addDoc, 
  doc, 
  setDoc, 
  serverTimestamp, 
  writeBatch, 
  deleteDoc 
} from 'firebase/firestore';
import { 
  Plus, 
  ChevronRight, 
  Package, 
  Trash2, 
  ImagePlus, 
  Info, 
  Check, 
  RefreshCw 
} from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { db, handleFirestoreError, OperationType } from '../firebase.js';
import { useAuth } from '../contexts/AuthContext.js';
import { Product, Quota } from '../types.js';
import { cn } from '../utils/cn.js';

export function ProductsListPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [quotas, setQuotas] = useState<Quota[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newProduct, setNewProduct] = useState<any>({ 
    name: '', 
    description: '', 
    image_url: '', 
    total_quotas: '', 
    quota_price: '',
    payment_type: 'installments',
    expiration_month: '',
    default_rule_type: 'percentage_of_paid',
    retention_percent: 25,
    allow_manual_adjustment: true
  });
  const { user, tenantId } = useAuth();

  const fetchProducts = () => {
    if (!tenantId) return;
    const q = query(collection(db, 'tenants', tenantId, 'products'), orderBy('created_at', 'desc'));
    return onSnapshot(q, (snapshot) => {
      const productsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product));
      setProducts(productsData);
    }, (err) => {
      console.error("Error in Products listener:", err);
      handleFirestoreError(err, OperationType.LIST, `tenants/${tenantId}/products`);
    });
  };

  useEffect(() => {
    if (!tenantId) return;
    const quotasRef = collection(db, 'tenants', tenantId, 'quotas');
    const unsubscribeQuotas = onSnapshot(quotasRef, (snapshot) => {
      setQuotas(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Quota)));
    });

    const unsubscribeProducts = fetchProducts();
    return () => {
      unsubscribeProducts && unsubscribeProducts();
      unsubscribeQuotas();
    };
  }, [tenantId]);

  const [creating, setCreating] = useState(false);
  const [creationProgress, setCreationProgress] = useState(0);

  const handleCreateProduct = async (status: 'draft' | 'active' = 'active') => {
    if (!newProduct.name || !newProduct.total_quotas || !newProduct.quota_price || !newProduct.expiration_month || !tenantId) {
      alert('Por favor, preencha todos os campos obrigatórios.');
      return;
    }

    if (newProduct.payment_type === 'installments') {
      const expDate = new Date(newProduct.expiration_month + 'T12:00:00');
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const dueDay = expDate.getDate();
      
      let count = 0;
      for (let i = 0; i < 24; i++) {
        const year = now.getFullYear();
        const month = now.getMonth() + i;
        const lastDay = new Date(year, month + 1, 0).getDate();
        const actualDay = Math.min(dueDay, lastDay);
        const d = new Date(year, month, actualDay, 12, 0, 0);
        
        if (d < now) continue;
        if (d > expDate) break;
        if (count === 0) {
          const diffDays = (d.getTime() - now.getTime()) / (1000 * 3600 * 24);
          if (diffDays < 30) continue;
        }
        count++;
        if (count >= 12) break;
      }
      
      if (count === 0) {
        return alert('A data de vencimento escolhida não permite gerar parcelas seguindo as regras (mínimo 30 dias para a primeira parcela e data final como limite).');
      }
    }

    setCreating(true);
    setCreationProgress(0);

    try {
      const totalQuotas = Number(newProduct.total_quotas);
      const productData = {
        ...newProduct,
        total_quotas: totalQuotas,
        quota_price: Number(newProduct.quota_price),
        created_at: new Date().toISOString(),
        sold_quotas: 0,
        available_quotas: totalQuotas,
        status: status
      };

      const productRef = await addDoc(collection(db, 'tenants', tenantId, 'products'), productData);
      
      const auditRef = doc(collection(db, 'tenants', tenantId, 'audit_logs'));
      await setDoc(auditRef, {
        user_id: user?.id || 'Sistema',
        user_name: user?.name || 'Sistema',
        action: 'CRIAR_PRODUTO',
        details: `Criou o produto ${newProduct.name} com ${newProduct.total_quotas} cotas como ${status === 'draft' ? 'Rascunho' : 'Ativo'}`,
        created_at: serverTimestamp()
      });

      if (status === 'active') {
        const quotasRef = collection(db, 'tenants', tenantId, 'quotas');
        const batchSize = 500;
        const numBatches = Math.ceil(totalQuotas / batchSize);

        for (let b = 0; b < numBatches; b++) {
          const batch = writeBatch(db);
          const start = b * batchSize + 1;
          const end = Math.min((b + 1) * batchSize, totalQuotas);

          for (let i = start; i <= end; i++) {
            const quotaRef = doc(quotasRef);
            batch.set(quotaRef, {
              product_id: productRef.id,
              number: i.toString().padStart(4, '0'),
              status: 'available',
              price: productData.quota_price,
              created_at: new Date().toISOString()
            });
          }
          
          await batch.commit();
          setCreationProgress(Math.round((end / totalQuotas) * 100));
        }
      }

      setShowCreate(false);
      setNewProduct({ 
        name: '', 
        description: '', 
        image_url: '', 
        total_quotas: '', 
        quota_price: '',
        payment_type: 'installments',
        expiration_month: '',
        default_rule_type: 'percentage_of_paid',
        retention_percent: 25,
        allow_manual_adjustment: true
      });
    } catch (err) {
      console.error(err);
      alert('Erro ao criar produto no Firebase');
    } finally {
      setCreating(false);
      setCreationProgress(0);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>, callback: (base64: string) => void) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        callback(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const deleteProduct = async (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (!tenantId) return;
    if (!confirm('Tem certeza que deseja excluir este produto? Todas as cotas serão removidas.')) return;

    try {
      await deleteDoc(doc(db, 'tenants', tenantId, 'products', id));
      
      const auditRef = doc(collection(db, 'tenants', tenantId, 'audit_logs'));
      await setDoc(auditRef, {
        user_id: user?.id || 'Sistema',
        user_name: user?.name || 'Sistema',
        action: 'EXCLUIR_PRODUTO',
        details: `Excluiu o produto ID: ${id}`,
        created_at: serverTimestamp()
      });

      alert('Produto excluído com sucesso!');
    } catch (err) {
      console.error(err);
      alert('Erro ao excluir produto');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <header>
          <h2 className="text-3xl font-bold tracking-tight">Produtos</h2>
          <p className="text-black/50">Gerencie seus ativos e cotas</p>
        </header>
        {user?.role === 'admin' && (
          <button 
            onClick={() => setShowCreate(true)}
            className="flex items-center gap-2 px-6 py-3 bg-black text-white rounded-2xl font-bold hover:scale-105 transition-all cursor-pointer border-none"
          >
            <Plus size={20} /> Novo Produto
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map(product => {
          const pQuotas = quotas.filter(q => q.product_id === product.id);
          const parentFractions: { [parentId: string]: number } = {};
          pQuotas.forEach(q => {
            if (q.parent_id) {
              parentFractions[q.parent_id] = (parentFractions[q.parent_id] || 0) + 1;
            }
          });

          let availableWeight = 0;
          pQuotas.forEach(q => {
            if (q.status === 'grouped') return;
            let weight = 1;
            if (q.parent_id) {
              const totalFracs = parentFractions[q.parent_id] || 1;
              weight = 1 / totalFracs;
            }
            if (q.status === 'available') {
              availableWeight += weight;
            }
          });

          const roundedAvailable = Math.round(availableWeight * 100) / 100;
          const isEsgotado = roundedAvailable < 0.01;
          const formattedAvailable = roundedAvailable % 1 === 0 
            ? Math.round(roundedAvailable).toString() 
            : roundedAvailable.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
          
          return (
            <Link key={product.id} to={`/products/${product.id}`} className="group relative">
              <div className="bg-white rounded-3xl overflow-hidden border border-black/5 shadow-sm hover:shadow-xl transition-all duration-500">
                <div className="h-48 bg-black/5 relative overflow-hidden">
                  {product.image_url ? (
                    <img 
                      src={product.image_url} 
                      className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <Package size={40} className="text-black/10" />
                    </div>
                  )}
                  {isEsgotado && (
                    <div className="absolute inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10">
                      <span className="px-6 py-2 bg-white text-black rounded-full font-bold text-sm tracking-widest uppercase">Esgotado</span>
                    </div>
                  )}
                  <div className="absolute top-4 right-4 px-3 py-1 bg-white/90 backdrop-blur rounded-full text-[10px] font-bold uppercase tracking-widest">
                    {formattedAvailable} Disponíveis
                  </div>
                  {user?.role === 'admin' && (
                    <button 
                      onClick={(e) => deleteProduct(e, product.id)}
                      className="absolute top-4 left-4 p-2 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-600 border-none cursor-pointer"
                    >
                      <Trash2 size={16} />
                    </button>
                  )}
                </div>
                <div className="p-6">
                  <h3 className="font-bold text-xl mb-2">{product.name}</h3>
                  <p className="text-sm text-black/50 line-clamp-6 mb-4">{product.description}</p>
                  <div className="flex items-center justify-between pt-4 border-t border-black/5">
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest opacity-40">Valor da Cota</p>
                      <p className="font-bold text-lg">
                        {product.quota_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                    </div>
                    <ChevronRight size={20} className="text-black/20 group-hover:text-black group-hover:translate-x-1 transition-all" />
                  </div>
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <AnimatePresence mode="wait">
        {showCreate && (
          <div key="create-product-modal" className="fixed inset-0 z-[100] flex items-center justify-center p-6">
            <motion.div 
              key="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowCreate(false)}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            />
            <motion.div 
              key="modal-content"
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="relative w-[95%] sm:w-full max-w-xl bg-white rounded-[32px] sm:rounded-[40px] p-6 sm:p-10 shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <h3 className="text-2xl font-bold mb-6">Novo Produto</h3>
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-1 space-y-4">
                    <input 
                      className="w-full p-4 bg-black/5 rounded-2xl outline-none border-none" 
                      placeholder="Nome do Produto" 
                      value={newProduct.name}
                      onChange={e => setNewProduct({...newProduct, name: e.target.value})}
                    />
                    <div className="relative">
                      <input 
                        className="w-full p-4 bg-black/5 rounded-2xl pr-12 outline-none border-none" 
                        placeholder="URL da Imagem" 
                        value={newProduct.image_url}
                        onChange={e => setNewProduct({...newProduct, image_url: e.target.value})}
                      />
                      <label className="absolute right-4 top-1/2 -translate-y-1/2 cursor-pointer hover:text-indigo-600 transition-colors">
                        <ImagePlus size={20} />
                        <input 
                          type="file" 
                          className="hidden" 
                          accept="image/*"
                          onChange={e => handleImageUpload(e, (base64) => setNewProduct({...newProduct, image_url: base64}))}
                        />
                      </label>
                    </div>
                  </div>
                  <div className="w-32 h-32 rounded-2xl bg-black/5 overflow-hidden border border-black/5 flex items-center justify-center">
                    {newProduct.image_url ? (
                      <img src={newProduct.image_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    ) : (
                      <Package size={32} className="text-black/10" />
                    )}
                  </div>
                </div>
                <textarea 
                  className="w-full p-4 bg-black/5 rounded-2xl h-32 outline-none border-none" 
                  placeholder="Descrição detalhada" 
                  value={newProduct.description}
                  onChange={e => setNewProduct({...newProduct, description: e.target.value})}
                />
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Quantidade de Cotas</label>
                    <input 
                      className="w-full p-4 bg-black/5 rounded-2xl mt-1 outline-none border-none" 
                      placeholder="Ex: 100" 
                      type="number" 
                      value={newProduct.total_quotas}
                      onChange={e => setNewProduct({...newProduct, total_quotas: e.target.value})}
                    />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Valor de Cada Cota (R$)</label>
                    <input 
                      className="w-full p-4 bg-black/5 rounded-2xl mt-1 outline-none border-none" 
                      placeholder="Ex: 1000,00" 
                      type="number" 
                      step="0.01"
                      value={newProduct.quota_price}
                      onChange={e => setNewProduct({...newProduct, quota_price: e.target.value})}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Tipo de Pagamento</label>
                    <select 
                      className="w-full p-4 bg-black/5 rounded-2xl mt-1 outline-none border-none"
                      value={newProduct.payment_type}
                      onChange={e => setNewProduct({...newProduct, payment_type: e.target.value as 'cash' | 'installments' | 'recurrent'})}
                    >
                      <option value="installments">Parcelado</option>
                      <option value="cash">À Vista</option>
                      <option value="recurrent">Recorrente (Mensal Fixo)</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Data de Vencimento da Última Parcela</label>
                    <div className="relative mt-1">
                      <input 
                        type="date"
                        className="w-full p-4 bg-black/5 rounded-2xl appearance-none focus:ring-2 focus:ring-black/5 transition-all outline-none border-none"
                        value={newProduct.expiration_month}
                        onChange={e => setNewProduct({...newProduct, expiration_month: e.target.value})}
                        min={new Date().toISOString().slice(0, 10)}
                      />
                    </div>
                  </div>
                </div>

                {newProduct.payment_type === 'recurrent' && (
                  <div className="p-4 bg-emerald-50 border border-emerald-100 rounded-2xl flex items-center gap-3">
                    <Info size={18} className="text-emerald-600" />
                    <p className="text-xs font-bold text-emerald-700">Este Produto tem Valor Mensal Inalterável</p>
                  </div>
                )}

                <div className="p-6 bg-black/5 rounded-3xl space-y-4">
                  <h4 className="text-sm font-bold uppercase tracking-widest opacity-40">Regra de Inadimplência</h4>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Tipo de Retenção</label>
                      <select 
                        className="w-full p-4 bg-white rounded-xl mt-1 text-sm outline-none border-none"
                        value={newProduct.default_rule_type}
                        onChange={e => setNewProduct({...newProduct, default_rule_type: e.target.value})}
                      >
                        <option value="percentage_of_paid">Perc. sobre valor pago</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-[10px] font-bold uppercase tracking-widest opacity-40 ml-1">Percentual (%)</label>
                      <input 
                        className="w-full p-4 bg-white rounded-xl mt-1 text-sm outline-none border-none" 
                        type="number"
                        value={newProduct.retention_percent}
                        onChange={e => setNewProduct({...newProduct, retention_percent: Number(e.target.value)})}
                      />
                    </div>
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <div className={cn(
                      "w-5 h-5 rounded-md border-2 flex items-center justify-center transition-all",
                      newProduct.allow_manual_adjustment ? "bg-black border-black" : "border-black/20 group-hover:border-black/40"
                    )}>
                      {newProduct.allow_manual_adjustment && <Check size={14} className="text-white" />}
                    </div>
                    <input 
                      type="checkbox" 
                      className="hidden" 
                      checked={newProduct.allow_manual_adjustment}
                      onChange={e => setNewProduct({...newProduct, allow_manual_adjustment: e.target.checked})}
                    />
                    <span className="text-sm font-medium">Permitir ajuste manual pelo administrador</span>
                  </label>
                </div>

                <div className="flex flex-col sm:flex-row gap-3 mt-4">
                  <button 
                    onClick={() => handleCreateProduct('draft')}
                    disabled={creating}
                    className="w-full sm:flex-1 py-4 bg-black/5 text-black rounded-2xl font-bold disabled:opacity-50 text-sm border-none cursor-pointer"
                  >
                    Salvar Rascunho
                  </button>
                  <button 
                    onClick={() => handleCreateProduct('active')}
                    disabled={creating}
                    className="w-full sm:flex-[2] py-4 bg-black text-white rounded-2xl font-bold disabled:opacity-50 flex items-center justify-center gap-2 text-sm border-none cursor-pointer"
                  >
                    {creating ? (
                      <>
                        <RefreshCw size={20} className="animate-spin" />
                        Criando Cotas... {creationProgress}%
                      </>
                    ) : 'Criar e Publicar'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ProductsListPage;
