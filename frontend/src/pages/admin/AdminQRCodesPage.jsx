import { useCallback, useEffect, useState } from 'react';
import { QrCode, Printer, Download, Eye } from 'lucide-react';
import { tableApi } from '../../services/endpoints';
import { useToast } from '../../context/ToastContext';
import { printQRCodes } from '../../components/orders/printOrder';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  Modal,
  PageHeader,
  Skeleton,
} from '../../components/ui';

/** Consultation, telechargement et impression des QR Codes des tables. */
export default function AdminQRCodesPage() {
  const toast = useToast();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [preview, setPreview] = useState(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setData(await tableApi.allQRCodes());
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const printAll = (tables) => {
    try {
      printQRCodes(data.restaurant, tables);
    } catch (err) {
      toast.error(err.message);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((index) => (
            <Skeleton key={index} className="h-64 rounded-2xl" />
          ))}
        </div>
      </div>
    );
  }

  if (error) return <ErrorState message={error.message} onRetry={load} isNetwork={error.isNetwork} />;

  const tables = data.tables;

  return (
    <div>
      <PageHeader
        title="QR Codes"
        subtitle="À imprimer et poser sur chaque table"
        icon={QrCode}
        action={
          tables.length > 0 && (
            <Button icon={Printer} onClick={() => printAll(tables)}>
              Imprimer tous les QR Codes
            </Button>
          )
        }
      />

      {tables.length === 0 ? (
        <Card>
          <EmptyState
            icon={QrCode}
            title="Aucun QR Code"
            description="Créez d'abord vos tables : chacune reçoit automatiquement un QR Code."
          />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {tables.map((table) => (
            <Card key={table.id} className="flex flex-col items-center p-5 text-center">
              <p className="text-xs font-bold uppercase tracking-widest text-ink-500">
                {data.restaurant?.name}
              </p>
              <h3 className="mt-1 text-xl font-extrabold text-ink-900">TABLE {table.number}</h3>

              <img
                src={table.dataUrl}
                alt={`QR Code table ${table.number}`}
                className="my-4 h-36 w-36"
              />

              <p className="text-xs text-ink-500">Scannez pour consulter le menu</p>

              {table.status !== 'ACTIVE' && (
                <span className="badge mt-2 bg-ink-100 text-ink-500">Table désactivée</span>
              )}

              <div className="mt-4 flex w-full flex-wrap justify-center gap-1.5">
                <Button variant="secondary" className="text-xs" onClick={() => setPreview(table)}>
                  <Eye size={14} /> Voir
                </Button>
                <a
                  href={table.dataUrl}
                  download={`qr-table-${table.number}.png`}
                  className="btn-secondary text-xs"
                >
                  <Download size={14} /> Télécharger
                </a>
                <Button variant="secondary" className="text-xs" onClick={() => printAll([table])}>
                  <Printer size={14} /> Imprimer
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        open={Boolean(preview)}
        onClose={() => setPreview(null)}
        title={preview ? `Table ${preview.number}` : ''}
        size="sm"
        footer={
          preview && (
            <>
              <a
                href={preview.dataUrl}
                download={`qr-table-${preview.number}.png`}
                className="btn-secondary"
              >
                <Download size={16} /> Télécharger
              </a>
              <Button icon={Printer} onClick={() => printAll([preview])}>
                Imprimer
              </Button>
            </>
          )
        }
      >
        {preview && (
          <div className="rounded-2xl border-2 border-dashed border-ink-300 p-6 text-center">
            <p className="text-sm font-bold uppercase tracking-widest text-ink-700">
              {data.restaurant?.name}
            </p>
            <h3 className="my-3 text-3xl font-extrabold text-ink-900">TABLE {preview.number}</h3>
            <img src={preview.dataUrl} alt="" className="mx-auto h-52 w-52" />
            <p className="mt-3 text-sm text-ink-600">Scannez pour consulter le menu</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
