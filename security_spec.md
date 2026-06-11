# Especificação de Segurança e Auditoria de Regras Firestore (Zero-Trust Architectural Hardening)

Este documento descreve a auditoria das Firestore Rules, as vulnerabilidades identificadas (com riscos práticos associados no ambiente do sistema) e define a matriz de autorização para o hardening definitivo do sistema.

---

## 1. Auditoria Crítica das Regras Anteriores (The "Dirty Dozen" Vulnerability Assessment)

Durante a auditoria analítica do arquivo `firestore.rules`, as seguintes vulnerabilidades críticas de sobrepermissão foram identificadas:

### Vulnerabilidade 1: Invasão de Tenant e Leitura Pública Completa
* **Arquivo:** `firestore.rules`
* **Linha aproximada:** 41-43
* **Motivo Inseguro:** `match /tenants/{tenantId} { allow read: if true; ... }`
* **Risco Prático:** Qualquer atacante/usuário não autenticado consegue varrer e listar IDs de tenants, extraindo as marcas, proprietários e estatutos de todas as organizações cadastradas de forma anônima.

### Vulnerabilidade 2: Sequestro de Lojas (Escala de Privilégio Invisível)
* **Arquivo:** `firestore.rules`
* **Linha aproximada:** 43
* **Motivo Inseguro:** `match /tenants/{tenantId} { allow update: if true; }`
* **Risco Prático:** Um usuário malicioso de qualquer tenant conseguiria modificar o `owner_id` de qualquer outra loja para o seu próprio UID, passando a ser considerado o dono legítimo perante validações client-side posteriores.

### Vulnerabilidade 3: Alteração Irrestrita de Configurações Organizacionais (Tenant-Poisoning)
* **Arquivo:** `firestore.rules`
* **Linha aproximada:** 48
* **Motivo Inseguro:** `match /settings/{settingKey} { allow write: if isSignedIn(); }`
* **Risco Prático:** Um usuário de perfil `client` (ou usuário sem tenant) consegue reescrever as chaves CSS, gateways de pagamento, ou URL de logo de qualquer Tenant arbitrariamente, paralisando a integridade visual e funcional dos subdomínios.

### Vulnerabilidade 4: Vazamento Total de Dados de Clientes (PII Breach)
* **Arquivo:** `firestore.rules`
* **Linha aproximada:** 53
* **Motivo Inseguro:** `match /users/{userId} { allow read: if true; }`
* **Risco Prático:** Violação catastrófica de privacidade. Qualquer usuário anônimo consegue ler os dados completos de todos os clientes cadastrados nas bases (incluindo CPF, E-mail, Chave Pix, Endereço e Telefone).

### Vulnerabilidade 5: Manipulação e Autopromoção de Perfis Administrativos (RBAC Spoofing)
* **Arquivo:** `firestore.rules`
* **Linha aproximada:** 55
* **Motivo Inseguro:** `match /users/{userId} { allow update: if isSignedIn(); }`
* **Risco Prático:** Um cliente comum pode emitir um `update` modificando seu próprio atributo `role` para `admin`, autopromovendo-se aos painéis financeiros e executivos. Também permite a um usuário subscrever dados de terceiros.

### Vulnerabilidade 6: Sabotagem de Contratos e Assinaturas (Legal Forgery)
* **Arquivo:** `firestore.rules`
* **Linha aproximada:** 111-113
* **Motivo Inseguro:** `match /signatures/{signatureId} { allow create: if isAuthUserOfTenant(tenantId); }`
* **Risco Prático:** Um cliente consegue postar uma assinatura digital forjada se passando por qualquer outro investidor/cliente de seu próprio tenant, uma vez que não havia trava do `user_id == auth.uid` em nível de servidor.

---

## 2. Abstração Clássica do Modelo Hardened (A Matriz Definitiva)

### ADMIN (Full Orchestrator)
- **Leitura:** Acesso total a todas as subcoleções (inclusive logs de auditoria e configurações).
- **Escrita:** Controle total em produtos, cotas, termos legais e registros de transações.

### MANAGER (Operational Staff)
- **Leitura:** Produtos (se não forem rascunho), quotas públicas, clientes de seu tenant, status de pagamentos de todos.
- **Escrita:** Baixas manuais de parcelas (status transicionado de `pending` para `paid`). Não pode realizar estornos/refunds (`amount < 0`) ou anulações de dívidas.

### CUSTOMER / CLIENT (Strict Isolation)
- **Leitura:** Suas cotas adquiridas, suas parcelas de pagamento faturadas, suas assinaturas de termos e produtos que estejam ativos. Não lê outros clientes.
- **Escrita:** Registro de sua própria reserva temporária (`reserved_by == auth.uid`) e compra em lote dos termos sob seu CPF. Sem alteração em registros arbitrários.

---

## 3. Teste de Invasão Simulador (Penetration Verification Vectors)

### Caso 1: Cliente modifica preço do produto para R$ 1,00
- **Ação:** `update` no path `/tenants/T1/products/P1` com `price: 1.00`.
- **Efeito:** Negado. Apenas `isAdmin(tenantId)` é permitido criar ou dar update em produtos.

### Caso 2: Cliente consulta a lista de usuários de outro cliente para roubar dados de contato
- **Ação:** `get` ou `list` no path `/tenants/T1/users/OUTRO_CLIENTE_ID`.
- **Efeito:** Negado. O cliente só passa na regra `if request.auth.uid == userId` ou se for Admin/Manager.

### Caso 3: Gerente tenta reverter ou estornar um pagamento de cota cancelada
- **Ação:** `update` no path `/tenants/T1/installments/I1` definindo `status: 'refund'`.
- **Efeito:** Negado. A regra de update de installments para Managers valida explicitamente `status != 'refund'`.

---
