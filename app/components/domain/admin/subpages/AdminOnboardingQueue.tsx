import React, { useState, useEffect, useMemo } from 'react';
import { collection, getDocs, doc, setDoc, getFirestore } from 'firebase/firestore';
import { initializeApp, deleteApp } from 'firebase/app';
import { getAuth, createUserWithEmailAndPassword, signOut } from 'firebase/auth';
import { getFirebaseApp, getResolvedFirebaseConfig, isFirebaseConfigured } from '../../../../core/services/firebase';
import { Button } from '../../../ui/Button';
import { Card, CardContent } from '../../../ui/Card';
import { Badge } from '../../../ui/Badge';
import { Alert } from '../../../ui/Alert';
import { XIcon } from '../../../ui/Icons';

export interface Applicant {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  role: 'driver' | 'dispatcher' | 'accountant';
  experience?: string;
  licenseNumber?: string;
  address?: string;
  status: 'pending' | 'reviewing' | 'approved' | 'rejected';
  createdAt: string;
  checks: {
    background: boolean;
    license: boolean;
    mvr: boolean;
    insurance: boolean;
  };
  documents?: { name: string; url: string; type: string }[];
  auditLog: Array<{ action: string; actor: string; timestamp: string }>;
}

export function AdminOnboardingQueue() {
  const [applicants, setApplicants] = useState<Applicant[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'reviewing' | 'approved' | 'rejected'>('all');
  const [selectedApplicant, setSelectedApplicant] = useState<Applicant | null>(null);
  const [isProvisioning, setIsProvisioning] = useState(false);

  useEffect(() => {
    fetchApplicants();
  }, []);

  const fetchApplicants = async () => {
    setIsLoading(true);
    if (!isFirebaseConfigured()) {
      // Mock data for local testing
      setApplicants([
        {
          id: 'app-1',
          firstName: 'John',
          lastName: 'Doe',
          email: 'john.doe@example.com',
          phone: '314-555-0198',
          role: 'driver',
          status: 'pending',
          createdAt: new Date().toISOString(),
          checks: { background: false, license: false, mvr: false, insurance: false },
          auditLog: []
        }
      ]);
      setIsLoading(false);
      return;
    }

    try {
      const db = getFirestore(getFirebaseApp());
      const snapshot = await getDocs(collection(db, 'applications'));
      const fetched: Applicant[] = [];
      snapshot.forEach(docSnap => {
        const data = docSnap.data() as Omit<Applicant, 'id'>;
        // ensure defaults for checks and logs
        fetched.push({ 
          ...data, 
          id: docSnap.id,
          checks: data.checks || { background: false, license: false, mvr: false, insurance: false },
          auditLog: data.auditLog || []
        });
      });
      setApplicants(fetched);
    } catch (err: any) {
      setError(err.message || 'Failed to load applicants.');
    } finally {
      setIsLoading(false);
    }
  };

  const logAudit = async (applicantId: string, action: string) => {
    const logEntry = { action, actor: 'Admin', timestamp: new Date().toISOString() };
    const target = applicants.find(a => a.id === applicantId);
    if (!target) return;

    const newLog = [...target.auditLog, logEntry];
    
    setApplicants(prev => prev.map(a => a.id === applicantId ? { ...a, auditLog: newLog } : a));
    
    if (selectedApplicant?.id === applicantId) {
      setSelectedApplicant(prev => prev ? { ...prev, auditLog: newLog } : null);
    }

    if (isFirebaseConfigured()) {
      const db = getFirestore(getFirebaseApp());
      const ref = doc(db, 'applications', applicantId);
      await setDoc(ref, { auditLog: newLog }, { merge: true }).catch(console.error);
    }
  };

  const toggleCheck = async (check: keyof Applicant['checks']) => {
    if (!selectedApplicant) return;
    const newValue = !selectedApplicant.checks[check];
    
    setApplicants(prev => prev.map(a => 
      a.id === selectedApplicant.id ? { ...a, checks: { ...a.checks, [check]: newValue } } : a
    ));
    setSelectedApplicant(prev => prev ? { ...prev, checks: { ...prev.checks, [check]: newValue } } : null);

    if (isFirebaseConfigured()) {
      const db = getFirestore(getFirebaseApp());
      const ref = doc(db, 'applications', selectedApplicant.id);
      await setDoc(ref, { checks: { [check]: newValue } }, { merge: true }).catch(console.error);
    }
    logAudit(selectedApplicant.id, `Toggled ${check} check to ${newValue}`);
  };

  const updateStatus = async (newStatus: Applicant['status']) => {
    if (!selectedApplicant) return;
    setApplicants(prev => prev.map(a => a.id === selectedApplicant.id ? { ...a, status: newStatus } : a));
    setSelectedApplicant(prev => prev ? { ...prev, status: newStatus } : null);

    if (isFirebaseConfigured()) {
      const db = getFirestore(getFirebaseApp());
      const ref = doc(db, 'applications', selectedApplicant.id);
      await setDoc(ref, { status: newStatus }, { merge: true }).catch(console.error);
    }
    logAudit(selectedApplicant.id, `Status updated to ${newStatus}`);
  };

  const provisionAccount = async () => {
    if (!selectedApplicant) return;
    setIsProvisioning(true);
    setError(null);
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
    const randomBytes = new Uint8Array(12);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(randomBytes);
    }
    const tempPass = Array.from(randomBytes, (b) => alphabet[b % alphabet.length]).join('');
    let createdUid = `user-${Date.now().toString(36)}`;

    try {
      if (isFirebaseConfigured()) {
        const tempAppName = `temp-provision-${Date.now()}`;
        const firebaseConfig = getResolvedFirebaseConfig();
        const secondaryApp = initializeApp(firebaseConfig, tempAppName);
        const secondaryAuth = getAuth(secondaryApp);

        try {
          const userCredential = await createUserWithEmailAndPassword(
            secondaryAuth,
            selectedApplicant.email,
            tempPass
          );
          createdUid = userCredential.user.uid;
        } finally {
          await signOut(secondaryAuth).catch(() => {});
          await deleteApp(secondaryApp).catch(() => {});
        }

        const db = getFirestore(getFirebaseApp());
        
        await setDoc(doc(db, 'users', createdUid), {
          uid: createdUid,
          email: selectedApplicant.email,
          displayName: `${selectedApplicant.firstName} ${selectedApplicant.lastName}`,
          role: selectedApplicant.role,
          phone: selectedApplicant.phone,
          driverLicense: selectedApplicant.licenseNumber || '',
          status: 'active',
          createdAt: new Date().toISOString(),
        });

        if (selectedApplicant.role === 'driver') {
          await setDoc(doc(db, 'fleet', `driver-${createdUid}`), {
             driverId: createdUid,
             name: `${selectedApplicant.firstName} ${selectedApplicant.lastName}`,
             license: selectedApplicant.licenseNumber || '',
             status: 'active'
          });
        }
      }

      await updateStatus('approved');
      setSuccess(`Provisioned ${selectedApplicant.email}. Temp password: ${tempPass} (Print Welcome Sheet)`);
      logAudit(selectedApplicant.id, `Account provisioned with UID: ${createdUid}`);
    } catch (err: any) {
      setError(err.message || 'Provisioning failed.');
    } finally {
      setIsProvisioning(false);
    }
  };

  const filtered = useMemo(() => {
    return applicants.filter(a => statusFilter === 'all' || a.status === statusFilter);
  }, [applicants, statusFilter]);

  return (
    <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
      <div className={`flex-1 min-w-0 ${selectedApplicant ? 'hidden lg:block lg:w-2/3' : 'w-full'}`}>
        <div className="flex justify-between items-center mb-3 sm:mb-4">
           <div className="flex gap-1.5 overflow-x-auto no-scrollbar w-full pb-0.5">
             {['all', 'pending', 'reviewing', 'approved', 'rejected'].map(s => (
               <button
                 key={s}
                 onClick={() => setStatusFilter(s as any)}
                 className={`px-3 py-1.5 text-xs rounded-full capitalize font-bold transition-all whitespace-nowrap shrink-0 cursor-pointer ${
                   statusFilter === s ? 'bg-surface-header text-white shadow-xs' : 'bg-surface-card border border-border-subtle text-fg-secondary hover:bg-surface-muted'
                 }`}
               >
                 {s}
               </button>
             ))}
           </div>
        </div>

        {error && <Alert variant="error" title="Error">{error}</Alert>}
        {success && <Alert variant="success" title="Success">{success}</Alert>}

        <Card variant="elevated" className="rounded-2xl overflow-hidden">
          <CardContent className="p-0 min-w-full">
            {/* Mobile Applicant Cards (< md) */}
            <div className="md:hidden divide-y divide-border-faint">
              {isLoading ? (
                <div className="p-8 text-center text-fg-muted text-xs">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="p-8 text-center text-fg-muted text-xs">No applicants found.</div>
              ) : filtered.map((a) => (
                <div key={a.id} className="p-3.5 space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="font-extrabold text-fg-primary text-sm truncate">
                        {a.firstName} {a.lastName}
                      </div>
                      <div className="text-xs text-fg-muted truncate">{a.email}</div>
                    </div>
                    <Badge variant={a.status === 'approved' ? 'success' : a.status === 'rejected' ? 'error' : a.status === 'reviewing' ? 'info' : 'warning'}>
                      {a.status}
                    </Badge>
                  </div>
                  <div className="flex items-center justify-between text-xs text-fg-muted">
                    <span className="capitalize font-semibold text-fg-secondary bg-surface-muted px-2 py-0.5 rounded-md">
                      {a.role}
                    </span>
                    <span>Applied {new Date(a.createdAt).toLocaleDateString()}</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setSelectedApplicant(a); setSuccess(null); setError(null); }}
                    className="w-full justify-center font-bold"
                  >
                    Review Dossier
                  </Button>
                </div>
              ))}
            </div>

            {/* Desktop Table (md+) */}
            <div className="hidden md:block overflow-x-auto custom-scrollbar min-w-full">
            <table className="w-full text-left text-xs min-w-[650px]">
              <thead className="bg-surface-subtle text-fg-secondary font-bold uppercase tracking-wider text-[10px]">
                <tr>
                  <th className="px-4 py-3">Applicant</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-faint">
                {isLoading ? (
                  <tr><td colSpan={5} className="p-8 text-center text-fg-muted">Loading...</td></tr>
                ) : filtered.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-fg-muted">No applicants found.</td></tr>
                ) : filtered.map(a => (
                  <tr key={a.id} className="hover:bg-surface-subtle">
                    <td className="px-4 py-3">
                      <div className="font-bold text-fg-primary">{a.firstName} {a.lastName}</div>
                      <div className="text-fg-muted">{a.email}</div>
                    </td>
                    <td className="px-4 py-3 capitalize">{a.role}</td>
                    <td className="px-4 py-3">
                      <Badge variant={a.status === 'approved' ? 'success' : a.status === 'rejected' ? 'error' : a.status === 'reviewing' ? 'info' : 'warning'}>
                        {a.status}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-fg-muted">{new Date(a.createdAt).toLocaleDateString()}</td>
                    <td className="px-4 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => { setSelectedApplicant(a); setSuccess(null); setError(null); }}>
                        Review Dossier
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {selectedApplicant && (
        <div className="w-full lg:w-1/3 flex flex-col gap-4">
           <Card className="border-status-info-border shadow-md">
             <CardContent className="p-4 sm:p-6 space-y-5">
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <h3 className="text-lg font-black text-fg-primary truncate">{selectedApplicant.firstName} {selectedApplicant.lastName}</h3>
                    <p className="text-xs sm:text-sm text-fg-muted break-words">{selectedApplicant.email} · {selectedApplicant.phone}</p>
                    <Badge className="mt-2 capitalize" variant="info">Target: {selectedApplicant.role}</Badge>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedApplicant(null)}
                    aria-label="Close applicant dossier"
                    className="p-1.5 rounded-lg text-fg-subtle hover:text-fg-secondary hover:bg-surface-muted shrink-0 cursor-pointer"
                  >
                    <XIcon className="w-4 h-4" />
                  </button>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-fg-secondary uppercase">Documents</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {(selectedApplicant.documents || []).length === 0 ? (
                      <div className="text-xs text-fg-subtle">No documents uploaded.</div>
                    ) : (
                      (selectedApplicant.documents || []).map((doc, idx) => (
                        <div key={idx} className="flex justify-between items-center bg-surface-subtle p-2 rounded-lg border border-border-faint">
                          <span className="text-xs font-semibold text-fg-secondary truncate mr-2" title={doc.name}>{doc.name}</span>
                          <a href={doc.url} target="_blank" rel="noreferrer" className="text-[10px] bg-status-info-bg-strong text-status-info-fg px-2 py-1 rounded font-bold hover:bg-blue-200">
                            View
                          </a>
                        </div>
                      ))
                    )}
                    <label className="mt-2 block w-full text-center border-2 border-dashed border-border-strong rounded-lg p-3 cursor-pointer hover:border-blue-500 hover:bg-status-info-bg transition-colors">
                      <span className="text-xs font-bold text-blue-600">Upload Document</span>
                      <input 
                        type="file" 
                        className="hidden" 
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (!file || !isFirebaseConfigured()) return;
                          
                          try {
                            const { getFirebaseStorage } = await import('../../../../core/services/firebase');
                            const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
                            
                            const storage = getFirebaseStorage();
                            const storageRef = ref(storage, `applications/${selectedApplicant.id}/${Date.now()}_${file.name}`);
                            
                            // Visual feedback
                            logAudit(selectedApplicant.id, `Started upload: ${file.name}`);
                            
                            await uploadBytes(storageRef, file);
                            const url = await getDownloadURL(storageRef);
                            
                            const newDoc = { name: file.name, url, type: file.type };
                            const updatedDocs = [...(selectedApplicant.documents || []), newDoc];
                            
                            const db = getFirestore(getFirebaseApp());
                            const appRef = doc(db, 'applications', selectedApplicant.id);
                            await setDoc(appRef, { documents: updatedDocs }, { merge: true });
                            
                            setSelectedApplicant(prev => prev ? { ...prev, documents: updatedDocs } : null);
                            setApplicants(prev => prev.map(a => a.id === selectedApplicant.id ? { ...a, documents: updatedDocs } : a));
                            logAudit(selectedApplicant.id, `Uploaded document: ${file.name}`);
                          } catch (err) {
                            console.error('Upload failed', err);
                            setError('Failed to upload document.');
                          }
                        }} 
                      />
                    </label>
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-fg-secondary uppercase">Compliance Checklist</h4>
                  <div className="grid grid-cols-1 gap-2">
                    {Object.entries(selectedApplicant.checks || {}).map(([k, v]) => (
                      <div key={k} className="flex justify-between items-center bg-surface-subtle p-2 rounded-lg border border-border-faint">
                        <span className="text-xs capitalize font-semibold text-fg-secondary">{k} Check</span>
                        <button 
                          onClick={() => toggleCheck(k as any)}
                          className={`w-10 h-5 rounded-full relative transition-colors ${v ? 'bg-emerald-500' : 'bg-surface-strong'}`}
                        >
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-surface-card rounded-full transition-transform ${v ? 'translate-x-5' : ''}`} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-fg-secondary uppercase">Action</h4>
                  {selectedApplicant.status !== 'approved' ? (
                    <Button 
                      className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold"
                      onClick={provisionAccount}
                      isLoading={isProvisioning}
                    >
                      Approve & Provision Account
                    </Button>
                  ) : (
                    <Alert variant="success" title="Approved">This account is fully provisioned.</Alert>
                  )}
                  {selectedApplicant.status !== 'rejected' && selectedApplicant.status !== 'approved' && (
                    <Button className="w-full mt-2" variant="outline" onClick={() => updateStatus('rejected')}>
                      Reject Application
                    </Button>
                  )}
                </div>

                <div className="space-y-3">
                  <h4 className="text-xs font-bold text-fg-secondary uppercase">Audit Log</h4>
                  <div className="max-h-40 overflow-y-auto text-[10px] space-y-1">
                    {(selectedApplicant.auditLog || []).map((log, i) => (
                      <div key={i} className="flex justify-between bg-surface-subtle p-1.5 rounded">
                        <span className="text-fg-secondary">{log.action}</span>
                        <span className="text-fg-subtle">{new Date(log.timestamp).toLocaleTimeString()}</span>
                      </div>
                    ))}
                    {(selectedApplicant.auditLog || []).length === 0 && <div className="text-fg-subtle">No logs yet.</div>}
                  </div>
                </div>
             </CardContent>
           </Card>
        </div>
      )}
    </div>
  );
}
