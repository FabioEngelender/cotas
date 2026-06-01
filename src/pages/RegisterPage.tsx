import * as React from 'react';
import { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  doc, 
  setDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { ImagePlus, Camera, RefreshCw, ArrowLeft } from 'lucide-react';
import { auth, db, handleFirestoreError, OperationType } from '../firebase.js';
import { useAuth } from '../contexts/AuthContext.js';
import { validateCPF } from '../utils/validators.js';
import { maskCPF, maskPhone, maskCEP } from '../utils/masks.js';

export function RegisterClient() {
  const { inviteTenantId } = useParams();
  const [formData, setFormData] = useState({ 
    name: '', 
    email: '', 
    password: '', 
    cpf: '', 
    phone: '', 
    address: '', 
    address_number: '',
    address_complement: '',
    address_cep: '',
    pix_key: '' 
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteTenantId) return;
    if (!formData.email || !formData.password || !formData.name) {
      setError('Por favor, preencha nome, e-mail e senha.');
      return;
    }

    if (formData.cpf) {
      if (!validateCPF(formData.cpf)) {
        setError('O CPF informado é inválido. Certifique-se de preencher corretamente.');
        return;
      }
    }

    setError('');
    setLoading(true);

    try {
      let firebaseUser;
      const tenantUsersRef = collection(db, 'tenants', inviteTenantId, 'users');

      // Check for CPF uniqueness inside this tenant
      if (formData.cpf) {
        const cleanCPF = formData.cpf.replace(/\D/g, '');
        const formattedCPF = maskCPF(cleanCPF);
        const cpfQuery = query(tenantUsersRef, where('cpf', '==', formattedCPF));
        const cpfSnap = await getDocs(cpfQuery);
        if (!cpfSnap.empty) {
          const matchedUser = cpfSnap.docs[0].data();
          if (matchedUser.email.toLowerCase() !== formData.email.toLowerCase()) {
            setError(`O documento de CPF informado já está associado a outro usuário cadastrado nesta loja.`);
            setLoading(false);
            return;
          }
        }
      }
      
      // Check if email is already in this tenant's users
      const emailQuery = query(tenantUsersRef, where('email', '==', formData.email.toLowerCase()));
      const emailSnap = await getDocs(emailQuery);
      
      if (!emailSnap.empty) {
        setError('E-mail já cadastrado nesta loja.');
        setLoading(false);
        return;
      }

      if (auth.currentUser && auth.currentUser.email === formData.email.toLowerCase()) {
        firebaseUser = auth.currentUser;
      } else {
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
          firebaseUser = userCredential.user;
        } catch (authErr: any) {
          if (authErr.code === 'auth/email-already-in-use') {
            try {
              const userCredential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
              firebaseUser = userCredential.user;
            } catch (signInErr: any) {
              throw new Error('Este e-mail já está em uso em outra loja. Por favor, use a mesma senha ou outro e-mail.');
            }
          } else {
            throw authErr;
          }
        }
      }

      if (!firebaseUser) throw new Error('Falha na autenticação.');

      const { password, ...dataToSave } = formData;
      await setDoc(doc(db, 'tenants', inviteTenantId, 'users', firebaseUser.uid), {
        ...dataToSave,
        email: firebaseUser.email,
        role: 'client',
        tenant_id: inviteTenantId,
        created_at: serverTimestamp()
      });

      alert('Cadastro realizado com sucesso!');
      navigate('/');
    } catch (err: any) {
      console.error(err);
      let message = 'Erro ao realizar cadastro. Verifique seus dados.';
      if (err.code === 'auth/email-already-in-use') {
        message = 'Este e-mail já está em uso.';
      } else if (err.code === 'auth/weak-password') {
        message = 'A senha deve ter pelo menos 6 caracteres.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'E-mail inválido.';
      } else if (err.code === 'auth/invalid-credential') {
        message = 'Credenciais inválidas. Verifique seu e-mail e senha.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F5F5F0]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full"
      >
        <div className="bg-white p-10 rounded-[32px] border border-[#141414]/5 shadow-xl">
          <div className="mb-10">
            <h2 className="text-3xl font-serif italic mb-2">Cadastro de Cliente</h2>
            <p className="text-[#141414]/60">Crie sua conta para participar desta loja</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-4 bg-red-50 text-red-600 text-sm rounded-2xl border border-red-100">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">
                Nome Completo <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                required
              />
            </div>
            <div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">
                  E-mail <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value.toLowerCase()})}
                  className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                  required
                />
              </div>
              <div className="mt-4">
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">
                  Senha <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                  required
                  minLength={6}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">
                  CPF <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => setFormData({...formData, cpf: maskCPF(e.target.value)})}
                  placeholder="000.000.000-00"
                  className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">
                  Telefone <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: maskPhone(e.target.value)})}
                  placeholder="(00)00000-0000"
                  className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">
                Endereço (Rua/Avenida) <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({...formData, address: e.target.value})}
                className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                required
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">
                  N° <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.address_number}
                  onChange={(e) => setFormData({...formData, address_number: e.target.value})}
                  className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">Comp.</label>
                <input
                  type="text"
                  value={formData.address_complement}
                  onChange={(e) => setFormData({...formData, address_complement: e.target.value})}
                  className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">
                  CEP <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.address_cep}
                  onChange={(e) => setFormData({...formData, address_cep: maskCEP(e.target.value)})}
                  placeholder="00.000-000"
                  className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                  required
                />
              </div>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-1 ml-1">
                Chave PIX <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={formData.pix_key}
                onChange={(e) => setFormData({...formData, pix_key: e.target.value})}
                className="w-full px-6 py-3 bg-[#F5F5F0] rounded-xl border-none outline-none text-sm"
                required
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-4 bg-[#141414] text-white rounded-2xl font-bold hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 mt-4 flex items-center justify-center gap-2 cursor-pointer border-none"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Finalizar Cadastro'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

export function RegisterTenant() {
  const [formData, setFormData] = useState({ 
    name: '', 
    cnpj: '', 
    image_url: '',
    adminName: '',
    adminEmail: '',
    password: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { setTenantId } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      let firebaseUser = auth.currentUser;
      
      if (!firebaseUser || firebaseUser.email !== formData.adminEmail) {
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, formData.adminEmail, formData.password);
          firebaseUser = userCredential.user;
        } catch (authErr: any) {
          if (authErr.code === 'auth/email-already-in-use') {
            throw new Error('Este e-mail já está em uso. Por favor, faça login primeiro ou use outro e-mail.');
          }
          if (authErr.code === 'auth/weak-password') {
            throw new Error('A senha deve ter pelo menos 6 caracteres.');
          }
          throw authErr;
        }
      }

      if (!firebaseUser) throw new Error('Falha na autenticação.');
      
      const tenantRef = doc(collection(db, 'tenants'));
      
      try {
        await setDoc(tenantRef, {
          name: formData.name,
          cnpj: formData.cnpj,
          image_url: formData.image_url,
          status: 'active',
          owner_id: firebaseUser.uid,
          created_at: serverTimestamp()
        });

        await setDoc(doc(db, 'tenants', tenantRef.id, 'users', firebaseUser.uid), {
          name: formData.adminName,
          email: formData.adminEmail,
          role: 'admin',
          tenant_id: tenantRef.id,
          created_at: serverTimestamp()
        });

        await setDoc(doc(db, 'tenants', tenantRef.id, 'settings', 'general'), {
          app_name: formData.name,
          primary_color: '#141414',
          logo_url: formData.image_url
        });

        await setDoc(doc(collection(db, 'tenants', tenantRef.id, 'terms')), {
          content: 'Termo padrão de adesão. O administrador pode editar este conteúdo nas configurações.',
          is_active: true,
          created_at: serverTimestamp()
        });
      } catch (err: any) {
        console.error("Operation failed:", err);
        handleFirestoreError(err, OperationType.WRITE, `tenants/${tenantRef.id}`);
        throw err;
      }

      setTenantId(tenantRef.id);
      alert('Loja criada com sucesso!');
      navigate('/');
    } catch (err: any) {
      console.error(err);
      let message = 'Erro ao criar loja: ' + (err.message || 'Erro desconhecido');
      if (err.code === 'auth/invalid-credential') {
        message = 'Credenciais inválidas. Verifique seu e-mail e senha.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F5F5F0]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full"
      >
        <div className="bg-white p-10 rounded-[32px] border border-[#141414]/5 shadow-xl">
          <div className="mb-10">
            <h2 className="text-3xl font-serif italic mb-2">Criar Nova Loja</h2>
            <p className="text-[#141414]/60">Cadastre sua loja no sistema CotaMaster</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 text-red-600 text-sm rounded-2xl border border-red-100">
                {error}
              </div>
            )}
            
            <div className="flex justify-center mb-4">
              <div className="w-24 h-24 rounded-full bg-black/5 border border-dashed border-black/10 flex items-center justify-center overflow-hidden relative group">
                {formData.image_url ? (
                  <img src={formData.image_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                ) : (
                  <ImagePlus className="w-8 h-8 text-black/20" />
                )}
                <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer">
                  <Camera className="text-white w-6 h-6" />
                  <input 
                    type="file" 
                    className="hidden" 
                    accept="image/*"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                          setFormData({...formData, image_url: reader.result as string});
                        };
                        reader.readAsDataURL(file);
                      }
                    }}
                  />
                </label>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Nome da Loja (Obrigatório)</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">CNPJ (Opcional)</label>
              <input
                type="text"
                value={formData.cnpj}
                onChange={(e) => setFormData({...formData, cnpj: e.target.value})}
                className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
              />
            </div>

            <div className="h-px bg-black/5 my-6" />

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Seu Nome (Admin)</label>
              <input
                type="text"
                value={formData.adminName}
                onChange={(e) => setFormData({...formData, adminName: e.target.value})}
                className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">E-mail de Acesso</label>
              <input
                type="email"
                value={formData.adminEmail}
                onChange={(e) => setFormData({...formData, adminEmail: e.target.value})}
                className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Senha</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-[#141414] text-white rounded-2xl font-medium hover:bg-[#141414]/90 transition-all disabled:opacity-50 shadow-lg shadow-black/10 flex items-center justify-center gap-2 cursor-pointer border-none"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Criar Loja e Perfil'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

export function RegisterManager() {
  const { inviteTenantId } = useParams();
  const [formData, setFormData] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteTenantId) return;
    if (!formData.email || !formData.password || !formData.name) {
      setError('Por favor, preencha todos os campos.');
      return;
    }
    setError('');
    setLoading(true);

    try {
      let firebaseUser;
      const tenantUsersRef = collection(db, 'tenants', inviteTenantId, 'users');
      const emailQuery = query(tenantUsersRef, where('email', '==', formData.email.toLowerCase()));
      const emailSnap = await getDocs(emailQuery);
      
      if (!emailSnap.empty) {
        setError('E-mail já cadastrado nesta loja.');
        setLoading(false);
        return;
      }

      if (auth.currentUser && auth.currentUser.email === formData.email.toLowerCase()) {
        firebaseUser = auth.currentUser;
      } else {
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
          firebaseUser = userCredential.user;
        } catch (authErr: any) {
          if (authErr.code === 'auth/email-already-in-use') {
            try {
              const userCredential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
              firebaseUser = userCredential.user;
            } catch (signInErr: any) {
              throw new Error('Este e-mail já está em uso em outra loja. Por favor, use a mesma senha ou outro e-mail.');
            }
          } else {
            throw authErr;
          }
        }
      }

      if (!firebaseUser) throw new Error('Falha na autenticação.');

      await setDoc(doc(db, 'tenants', inviteTenantId, 'users', firebaseUser.uid), {
        name: formData.name,
        email: formData.email,
        role: 'manager',
        tenant_id: inviteTenantId,
        created_at: serverTimestamp()
      });

      alert('Gerente cadastrado com sucesso!');
      navigate('/');
    } catch (err: any) {
      console.error(err);
      let message = 'Erro ao realizar cadastro. Verifique seus dados.';
      if (err.code === 'auth/email-already-in-use') {
        message = 'Este e-mail já está em uso.';
      } else if (err.code === 'auth/weak-password') {
        message = 'A senha deve ter pelo menos 6 caracteres.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'E-mail inválido.';
      } else if (err.code === 'auth/invalid-credential') {
        message = 'Credenciais inválidas. Verifique seu e-mail e senha.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#F5F5F0]">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-md w-full"
      >
        <div className="bg-white p-10 rounded-[32px] border border-[#141414]/5 shadow-xl">
          <div className="mb-10">
            <h2 className="text-3xl font-serif italic mb-2">Cadastro de Gerente</h2>
            <p className="text-[#141414]/60">Crie sua conta de gerente para esta loja</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 text-red-600 text-sm rounded-2xl border border-red-100">
                {error}
              </div>
            )}
            
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Nome Completo</label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">E-mail</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({...formData, email: e.target.value})}
                className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Senha</label>
              <input
                type="password"
                value={formData.password}
                onChange={(e) => setFormData({...formData, password: e.target.value})}
                className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                required
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-[#141414] text-white rounded-2xl font-medium hover:bg-[#141414]/90 transition-all disabled:opacity-50 shadow-lg shadow-black/10 flex items-center justify-center gap-2 cursor-pointer border-none"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : 'Cadastrar Gerente'}
            </button>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

export function Register() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    cpf: '',
    phone: '',
    address: '',
    address_number: '',
    address_complement: '',
    address_cep: '',
    pix_key: ''
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { tenantId, setTenantId } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tenantId) return;
    if (!formData.email || !formData.password || !formData.name) {
      setError('Por favor, preencha nome, e-mail e senha.');
      return;
    }

    if (formData.cpf) {
      if (!validateCPF(formData.cpf)) {
        setError('O CPF informado é inválido. Certifique-se de preencher corretamente.');
        return;
      }
    }

    setError('');
    setLoading(true);

    try {
      let firebaseUser;
      const tenantUsersRef = collection(db, 'tenants', tenantId, 'users');

      // Check for CPF uniqueness inside this tenant
      if (formData.cpf) {
        const cleanCPF = formData.cpf.replace(/\D/g, '');
        const formattedCPF = maskCPF(cleanCPF);
        const cpfQuery = query(tenantUsersRef, where('cpf', '==', formattedCPF));
        const cpfSnap = await getDocs(cpfQuery);
        if (!cpfSnap.empty) {
          const matchedUser = cpfSnap.docs[0].data();
          if (matchedUser.email.toLowerCase() !== formData.email.toLowerCase()) {
            setError(`O documento de CPF informado já está associado a outro usuário cadastrado nesta loja.`);
            setLoading(false);
            return;
          }
        }
      }
      
      // Check if email is already in this tenant's users
      const emailQuery = query(tenantUsersRef, where('email', '==', formData.email.toLowerCase()));
      const emailSnap = await getDocs(emailQuery);
      
      if (!emailSnap.empty) {
        setError('E-mail já cadastrado nesta loja.');
        setLoading(false);
        return;
      }

      if (auth.currentUser && auth.currentUser.email === formData.email.toLowerCase()) {
        firebaseUser = auth.currentUser;
      } else {
        try {
          const userCredential = await createUserWithEmailAndPassword(auth, formData.email, formData.password);
          firebaseUser = userCredential.user;
        } catch (authErr: any) {
          if (authErr.code === 'auth/email-already-in-use') {
            try {
              const userCredential = await signInWithEmailAndPassword(auth, formData.email, formData.password);
              firebaseUser = userCredential.user;
            } catch (signInErr: any) {
              throw new Error('Este e-mail já está em uso em outra loja. Por favor, use a mesma senha ou outro e-mail.');
            }
          } else {
            throw authErr;
          }
        }
      }

      if (!firebaseUser) throw new Error('Falha na autenticação.');

      const { password, ...dataToSave } = formData;
      await setDoc(doc(db, 'tenants', tenantId, 'users', firebaseUser.uid), {
        ...dataToSave,
        email: firebaseUser.email,
        role: 'client',
        tenant_id: tenantId,
        created_at: serverTimestamp()
      });

      alert('Cadastro realizado com sucesso!');
      navigate('/');
    } catch (err: any) {
      console.error(err);
      let message = 'Erro ao realizar cadastro. Verifique seus dados.';
      if (err.code === 'auth/email-already-in-use') {
        message = 'Este e-mail já está em uso.';
      } else if (err.code === 'auth/weak-password') {
        message = 'A senha deve ter pelo menos 6 caracteres.';
      } else if (err.code === 'auth/invalid-email') {
        message = 'E-mail inválido.';
      } else if (err.code === 'auth/invalid-credential') {
        message = 'Credenciais inválidas. Verifique seu e-mail e senha.';
      }
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="max-w-2xl w-full"
      >
        <div className="bg-white p-10 rounded-[32px] border border-[#141414]/5 shadow-xl">
          <button 
            type="button"
            onClick={() => setTenantId(null)}
            className="mb-8 flex items-center text-sm text-[#141414]/40 hover:text-[#141414] transition-colors bg-transparent border-none cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4 mr-1" /> <span>Voltar para seleção de lojas</span>
          </button>

          <div className="mb-10">
            <h2 className="text-3xl font-serif italic mb-2">Cadastre-se</h2>
            <p className="text-[#141414]/60">Crie sua conta para começar a investir</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {error && (
              <div className="p-4 bg-red-50 text-red-600 text-sm rounded-2xl border border-red-100">
                {error}
              </div>
            )}
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                  Nome Completo <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                  E-mail <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={formData.email}
                  onChange={(e) => setFormData({...formData, email: e.target.value})}
                  className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                  Senha <span className="text-red-500">*</span>
                </label>
                <input
                  type="password"
                  value={formData.password}
                  onChange={(e) => setFormData({...formData, password: e.target.value})}
                  className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                  required
                  minLength={6}
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                  CPF <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.cpf}
                  onChange={(e) => setFormData({...formData, cpf: maskCPF(e.target.value)})}
                  placeholder="000.000.000-00"
                  className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                  Telefone <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.phone}
                  onChange={(e) => setFormData({...formData, phone: maskPhone(e.target.value)})}
                  placeholder="(00)00000-0000"
                  className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                  required
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                  Chave PIX <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.pix_key}
                  onChange={(e) => setFormData({...formData, pix_key: e.target.value})}
                  className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                  required
                />
              </div>
            </div>

            <div className="space-y-6">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                  Endereço (Rua/Avenida) <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.address}
                  onChange={(e) => setFormData({...formData, address: e.target.value})}
                  className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                  required
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                    N° <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.address_number}
                    onChange={(e) => setFormData({...formData, address_number: e.target.value})}
                    className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">Complemento</label>
                  <input
                    type="text"
                    value={formData.address_complement}
                    onChange={(e) => setFormData({...formData, address_complement: e.target.value})}
                    className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-widest text-[#141414]/40 mb-2 ml-1">
                    CEP <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formData.address_cep}
                    onChange={(e) => setFormData({...formData, address_cep: maskCEP(e.target.value)})}
                    placeholder="00.000-000"
                    className="w-full px-6 py-4 bg-[#F5F5F0] rounded-2xl border-none outline-none"
                    required
                  />
                </div>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-5 bg-[#141414] text-white rounded-2xl font-medium hover:bg-[#141414]/90 transition-all disabled:opacity-50 shadow-lg shadow-black/10 cursor-pointer border-none"
            >
              {loading ? <RefreshCw className="w-5 h-5 animate-spin mx-auto" /> : 'Criar Conta'}
            </button>
          </form>

          <div className="mt-8 pt-8 border-t border-[#141414]/5 text-center">
            <p className="text-sm text-[#141414]/40">
              Já tem uma conta?{' '}
              <Link to="/login" className="text-[#141414] font-medium hover:underline">
                Entrar
              </Link>
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

export default Register;
