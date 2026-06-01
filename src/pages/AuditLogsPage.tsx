import React, { useState, useEffect, useContext } from 'react';
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';

import { db } from '../firebase.js';
import AuthContext from '../contexts/AuthContext.js';

export default function AuditLogsPage() {
  const [logs, setLogs] = useState<any[]>([]);
  const { tenantId } = useContext(AuthContext)!;

  useEffect(() => {
    if (!tenantId) return;
    const q = query(collection(db, 'tenants', tenantId, 'audit_logs'), orderBy('created_at', 'desc'), limit(100));
    return onSnapshot(q, (snapshot) => {
      setLogs(snapshot.docs.map(d => ({ id: d.id, ...d.data() })));
    });
  }, [tenantId]);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-bold tracking-tight">Logs de Auditoria</h2>
        <p className="text-black/50">Rastreabilidade completa de ações críticas efetuadas no sistema</p>
      </header>
      <div className="space-y-4">
        {logs.map((log, i) => (
          <div key={i} className="bg-white p-6 rounded-2xl border border-black/5 shadow-sm flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-2.5 h-2.5 rounded-full bg-indigo-500 shrink-0" />
              <div>
                <p className="font-bold text-sm uppercase tracking-wide">{log.action}</p>
                <p className="text-xs text-black/50 mt-1">
                  {log.details} (por <span className="font-semibold">{log.user_name || 'Sistema'}</span>)
                </p>
              </div>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-mono text-black/40 bg-black/5 px-3 py-1 rounded-lg">
                {log.created_at?.toDate?.() ? log.created_at.toDate().toLocaleString('pt-BR') : 
                 log.created_at ? new Date(log.created_at).toLocaleString('pt-BR') : 'N/A'}
              </p>
            </div>
          </div>
        ))}
        {logs.length === 0 && (
          <p className="text-center text-black/30 py-20 bg-white rounded-3xl border border-black/5 font-medium">Nenhum log registrado de momento.</p>
        )}
      </div>
    </div>
  );
}
