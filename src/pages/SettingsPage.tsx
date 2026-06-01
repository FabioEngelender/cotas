import * as React from 'react';
import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  query, 
  collection, 
  onSnapshot, 
  doc, 
  getDoc, 
  setDoc,
  updateDoc, 
  addDoc, 
  serverTimestamp, 
  getDocs, 
  writeBatch, 
  deleteDoc 
} from 'firebase/firestore';
import { Trash2, Camera, Clover, Download, Upload, Shield } from 'lucide-react';
import { db } from '../firebase.js';
import { useAuth, ADMIN_MASTER_EMAIL } from '../contexts/AuthContext.js';
import { maskCNPJ } from '../utils/masks.js';

export function SettingsPage() {
  const [settings, setSettings] = useState<any>({ app_name: '', admin_name: '' });
  const [loading, setLoading] = useState(false);
  const [newTenant, setNewTenant] = useState({ name: '', cnpj: '', image_url: '' });
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [tenants, setTenants] = useState<any[]>([]);
  const { user, setUser, tenantId } = useAuth();
  const navigate = useNavigate();

  const fetchTenants = () => {
    const q = query(collection(db, 'tenants'));
    return onSnapshot(q, (snapshot) => {
      setTenants(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  };

  useEffect(() => {
    if (!tenantId) return;
    const settingsRef = doc(db, 'tenants', tenantId, 'settings', 'general');
    getDoc(settingsRef).then(docSnap => {
      if (docSnap.exists()) {
        setSettings(docSnap.data());
      }
    });
    
    const unsubscribe = fetchTenants();
    return () => unsubscribe && unsubscribe();
  }, [tenantId]);

  const handleSave = async () => {
    if (!tenantId || !user) return;
    setLoading(true);
    try {
      await updateDoc(doc(db, 'tenants', tenantId, 'settings', 'general'), {
        app_name: settings.app_name,
        cnpj: settings.cnpj || '',
        image_url: settings.image_url || ''
      });

      await updateDoc(doc(db, 'tenants', tenantId), {
        name: settings.app_name,
        cnpj: settings.cnpj || '',
        image_url: settings.image_url || ''
      });

      alert('Configurações salvas com sucesso!');
    } catch (err: any) {
      console.error(err);
      alert('Erro ao salvar configurações: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setSettings({ ...settings, image_url: reader.result as string });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCreateTenant = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingTenant(true);
    try {
      const docRef = await addDoc(collection(db, 'tenants'), {
        ...newTenant,
        created_at: serverTimestamp()
      });
      
      await setDoc(doc(db, 'tenants', docRef.id, 'settings', 'general'), {
        app_name: newTenant.name,
        admin_name: 'Administrador'
      });

      alert(`Loja "${newTenant.name}" criada com sucesso!`);
      setNewTenant({ name: '', cnpj: '', image_url: '' });
    } catch (err) {
      console.error(err);
      alert('Erro ao criar loja');
    } finally {
      setCreatingTenant(false);
    }
  };

  const handleDeleteTenant = async (id: string, name: string) => {
    if (!confirm(`TEM CERTEZA que deseja excluir a loja "${name}"? Todos os dados (produtos, clientes, cotas) serão permanentemente apagados.`)) return;
    
    try {
      const collectionsToDelete = [
        'users',
        'products',
        'quotas',
        'installments',
        'terms',
        'audit_logs',
        'settings'
      ];

      for (const collName of collectionsToDelete) {
        const collRef = collection(db, 'tenants', id, collName);
        const snapshot = await getDocs(collRef);
        const batch = writeBatch(db);
        snapshot.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
      }

      await deleteDoc(doc(db, 'tenants', id));
      alert('Loja excluída com sucesso!');
    } catch (err: any) {
      console.error(err);
      alert('Erro ao excluir loja: ' + err.message);
    }
  };

  const deleteCurrentTenant = async () => {
    if (!tenantId || !settings.app_name) return;
    await handleDeleteTenant(tenantId, settings.app_name);
    setUser(null);
    navigate('/');
  };

  const handleExport = async () => {
    alert('Exportação desativada na versão Firebase. Use o console do Firebase para backups.');
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    alert('Importação desativada na versão Firebase.');
  };

  return (
    <div className="space-y-8 max-w-4xl">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Configurações</h2>
          <p className="text-black/50">Gerencie a identidade e dados do sistema</p>
        </div>
        {user?.email === ADMIN_MASTER_EMAIL && (
          <button 
            onClick={deleteCurrentTenant}
            className="px-6 py-2 bg-red-50 text-red-600 rounded-xl text-sm font-bold hover:bg-red-100 transition-colors flex items-center gap-2 cursor-pointer border-none"
          >
            <Trash2 size={16} />
            Excluir Loja
          </button>
        )}
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-[40px] border border-black/5 shadow-sm space-y-6">
          <h3 className="font-bold text-xl">Identidade</h3>
          
          <div className="space-y-4">
            <div className="flex items-center gap-6 p-4 bg-black/5 rounded-2xl">
              <div className="w-20 h-20 rounded-2xl bg-white border border-black/5 flex items-center justify-center overflow-hidden relative group">
                {settings.image_url ? (
                  <img src={settings.image_url} alt="Logo" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <Clover size={32} className="opacity-20" />
                )}
                <label className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer text-white">
                  <Camera size={20} />
                  <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
                </label>
              </div>
              <div className="flex-1">
                <p className="text-sm font-bold">Logo da Loja</p>
                <p className="text-xs text-black/40">Clique na imagem para alterar o logo</p>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold uppercase tracking-widest opacity-50">Nome da Loja</label>
              <input 
                type="text" 
                value={settings.app_name || ''}
                onChange={e => setSettings({...settings, app_name: e.target.value})}
                className="w-full p-4 mt-1 bg-black/5 rounded-2xl border-none focus:ring-2 focus:ring-black/10 transition-all focus:outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold uppercase tracking-widest opacity-50">CNPJ (Opcional)</label>
              <input 
                type="text" 
                value={settings.cnpj || ''}
                onChange={e => setSettings({...settings, cnpj: maskCNPJ(e.target.value)})}
                placeholder="00.000.000/0000-00"
                className="w-full p-4 mt-1 bg-black/5 rounded-2xl border-none focus:ring-2 focus:ring-black/10 transition-all font-mono focus:outline-none"
              />
            </div>
            <button 
              onClick={handleSave}
              disabled={loading}
              className="w-full py-4 bg-black text-white rounded-2xl font-bold hover:scale-[1.02] transition-all disabled:opacity-50 cursor-pointer border-none"
            >
              {loading ? 'Salvando...' : 'Salvar Alterações'}
            </button>
          </div>
        </div>

        <div className="bg-white p-8 rounded-[40px] border border-black/5 shadow-sm space-y-6">
          <h3 className="font-bold text-xl">Backup de Dados</h3>
          <p className="text-sm text-black/50">Exporte todos os dados do sistema para um arquivo JSON ou restaure um backup anterior.</p>
          
          <div className="space-y-4">
            <button 
              onClick={handleExport}
              className="w-full py-4 bg-emerald-50 text-emerald-600 rounded-2xl font-bold hover:bg-emerald-100 transition-all flex items-center justify-center gap-2 cursor-pointer border-none"
            >
              <Download size={20} /> Exportar Backup
            </button>
            
            <div className="relative">
              <input 
                type="file" 
                accept=".json"
                onChange={handleImport}
                className="absolute inset-0 opacity-0 cursor-pointer z-10"
              />
              <button 
                type="button"
                className="w-full py-4 bg-indigo-50 text-indigo-600 rounded-2xl font-bold hover:bg-indigo-100 transition-all flex items-center justify-center gap-2 border-none"
              >
                <Upload size={20} /> Importar Backup
              </button>
            </div>
          </div>
        </div>

        {user?.email === ADMIN_MASTER_EMAIL && (
          <div className="bg-amber-50 p-8 rounded-[40px] border border-amber-200 shadow-sm space-y-4 md:col-span-2">
            <div className="flex items-center gap-3 text-amber-800">
              <Shield size={24} />
              <h3 className="font-bold text-xl">Dica do Administrador Master: Reuso de E-mails</h3>
            </div>
            <p className="text-sm text-amber-900/70 leading-relaxed">
              Para reutilizar e-mails de testes em novas lojas, você deve excluí-los manualmente no <strong>Console do Firebase &gt; Autenticação</strong>. 
              Ao excluir uma loja pelo sistema, os dados do banco (Firestore) são apagados, mas as contas de login permanecem no Firebase por segurança. 
              Excluir a conta no console liberará o e-mail para um novo cadastro.
            </p>
          </div>
        )}

        {user?.role === 'super_admin' && (
          <div className="bg-white p-8 rounded-[40px] border border-black/5 shadow-sm space-y-6">
            <h3 className="font-bold text-xl">Criar Nova Loja</h3>
            <p className="text-sm text-black/60">Compartilhe o link abaixo para que alguém crie uma nova loja no sistema.</p>
            <div className="flex gap-2">
              <input 
                type="text" 
                readOnly 
                value={`${window.location.origin}/register-tenant`}
                className="flex-1 px-4 py-2 bg-black/5 rounded-xl text-sm"
              />
              <button 
                onClick={() => {
                  navigator.clipboard.writeText(`${window.location.origin}/register-tenant`);
                  alert('Link copiado!');
                }}
                className="px-4 py-2 bg-black text-white rounded-xl text-sm font-bold cursor-pointer border-none"
              >
                Copiar Link
              </button>
            </div>
          </div>
        )}

        {user?.role === 'super_admin' && (
          <div className="bg-white p-8 rounded-[40px] border border-black/5 shadow-sm space-y-6 md:col-span-2">
            <h3 className="font-bold text-xl">Gerenciar Lojas</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {tenants.map(t => (
                <div key={t.id} className="p-4 bg-black/5 rounded-2xl flex items-center justify-between group">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <div className="w-10 h-10 rounded-full bg-white overflow-hidden flex-shrink-0 border border-black/5">
                      {t.image_url ? (
                        <img src={t.image_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-black/10">
                          <Shield size={16} />
                        </div>
                      )}
                    </div>
                    <div className="truncate">
                      <p className="font-bold text-sm truncate">{t.name}</p>
                      <p className="text-[10px] opacity-40 uppercase tracking-wider">{t.id === 'main' ? 'Matriz' : `${t.client_count || 0} Clientes`}</p>
                    </div>
                  </div>
                  {t.id !== 'main' && (
                    <button 
                      onClick={() => handleDeleteTenant(t.id, t.name)}
                      className="p-2 text-red-500 hover:bg-red-50 rounded-xl transition-all opacity-0 group-hover:opacity-100 cursor-pointer border-none bg-transparent"
                    >
                      <Trash2 size={18} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default SettingsPage;
