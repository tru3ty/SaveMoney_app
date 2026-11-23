import { useMemo, useRef, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ChevronDown,
  Download,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Wallet,
  Receipt,
  FolderTree,
  Package,
} from 'lucide-react';
import { useBudget } from '../store';
import { categoryById, envelopeViews, activePeriod } from '../lib/budget';
import { isDemoMode, TODAY } from '../lib/mode';
import { formatMoney } from '../lib/money';
import { formatMonth } from '../lib/dates';
import { CategoryIcon } from '../components/CategoryIcon';
import {
  EntitySheet,
  MoneyField,
  TextField,
  ColorPicker,
  ActiveToggle,
  ICON_CHOICES,
} from '../components/fields';
import { Field, inputCls } from '../components/ui';
import { CATEGORY_COLORS, validateCategoryInput } from '../lib/validate';
import type { Category, IncomeSource, Obligation } from '../types';

interface Props {
  onClose: () => void;
  initialSection?: Section;
}

type Section = 'income' | 'obligations' | 'categories' | 'envelopes' | 'data';

const SECTIONS: { id: Section; label: string; icon: typeof Wallet }[] = [
  { id: 'income', label: 'Доходы', icon: Wallet },
  { id: 'obligations', label: 'Обязательства', icon: Receipt },
  { id: 'categories', label: 'Категории', icon: FolderTree },
  { id: 'envelopes', label: 'Лимиты конвертов', icon: Package },
  { id: 'data', label: 'Данные', icon: Download },
];

export function SettingsScreen({ onClose, initialSection }: Props) {
  const [section, setSection] = useState<Section | null>(
    initialSection ?? null,
  );

  return (
    <motion.div
      className="absolute inset-0 z-40 flex flex-col bg-slate-50 "
      initial={{ x: '100%' }}
      animate={{ x: 0 }}
      exit={{ x: '100%' }}
      transition={{ type: 'spring', stiffness: 320, damping: 34 }}
    >
      <div className="flex items-center gap-2 border-b border-slate-200/70 px-4 pb-3 pt-4 ">
        {section ? (
          <button
            onClick={() => setSection(null)}
            className="rounded-full p-1.5 text-slate-500 hover:bg-slate-200 "
          >
            <ArrowLeft size={20} />
          </button>
        ) : null}
        <h1 className="flex-1 text-xl font-bold tracking-tight text-slate-900 ">
          {section
            ? SECTIONS.find((s) => s.id === section)?.label
            : 'Настройки'}
        </h1>
        <button
          onClick={onClose}
          className="rounded-full bg-slate-200/70 px-3 py-1.5 text-xs font-bold text-slate-600 "
        >
          Готово
        </button>
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-10 pt-4">
        {section === null && (
          <div className="space-y-2">
            {SECTIONS.map((s) => (
              <button
                key={s.id}
                onClick={() => setSection(s.id)}
                className="flex w-full items-center gap-3 rounded-2xl bg-white p-4 text-left shadow-sm ring-1 ring-slate-100 transition hover:bg-slate-50 "
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400">
                  <s.icon size={18} />
                </span>
                <span className="flex-1 text-[15px] font-semibold text-slate-900 ">
                  {s.label}
                </span>
                <ChevronDown
                  size={16}
                  className="rotate-[-90deg] text-slate-300 "
                />
              </button>
            ))}
          </div>
        )}
        {section === 'income' && <IncomeSection />}
        {section === 'obligations' && <ObligationsSection />}
        {section === 'categories' && <CategoriesSection />}
        {section === 'envelopes' && <EnvelopesSection />}
        {section === 'data' && <DataSection />}
      </div>
    </motion.div>
  );
}

function ItemRow({
  children,
  onEdit,
  onDelete,
}: {
  children: ReactNode;
  onEdit: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className="flex items-center gap-1 rounded-2xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-100 ">
      <button
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        {children}
      </button>
      <IconBtn onClick={onEdit} title="Изменить">
        <Pencil size={15} />
      </IconBtn>
      {onDelete && (
        <IconBtn onClick={onDelete} title={isDemoMode ? 'Удалить' : 'Отключить'} danger>
          <Trash2 size={15} />
        </IconBtn>
      )}
    </div>
  );
}

function IconBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${danger ? 'text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10' : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700 '}`}
    >
      {children}
    </button>
  );
}

function AddButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-200 py-3 text-sm font-bold text-slate-500 transition hover:border-emerald-300 hover:text-emerald-600 "
    >
      <Plus size={16} /> {label}
    </button>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <div className="rounded-2xl bg-white/60 px-4 py-6 text-center text-sm text-slate-400 ">
      {text}
    </div>
  );
}

function IncomeSection() {
  const { data, deleteIncomeSource } = useBudget();
  const [editing, setEditing] = useState<IncomeSource | 'new' | null>(null);

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs text-slate-400 ">
        Зарплата, аванс, подработка. Используются для прогноза «доступно до…».
      </p>
      {data.incomeSources.length === 0 && (
        <Empty text="Источников дохода нет" />
      )}
      {data.incomeSources.map((s) => (
        <ItemRow
          key={s.id}
          onEdit={() => setEditing(s)}
          onDelete={() => deleteIncomeSource(s.id)}
        >
          <span className="min-w-0 flex-1">
            <span
              className={`block truncate text-[15px] font-semibold ${s.isActive ? 'text-slate-900 ' : 'text-slate-400 line-through '}`}
            >
              {s.name}
            </span>
            <span className="block text-xs text-slate-400">
              {formatMoney(s.amount)} ·{' '}
              {s.schedule === 'monthly_day'
                ? `${s.dayOfMonth}-го числа`
                : s.schedule === 'monthly_last_day'
                  ? 'последний день месяца'
                  : 'нерегулярный'}
            </span>
          </span>
        </ItemRow>
      ))}
      <AddButton onClick={() => setEditing('new')} label="Добавить источник" />
      <IncomeForm
        source={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function IncomeForm({
  source,
  open,
  onClose,
}: {
  source: IncomeSource | null;
  open: boolean;
  onClose: () => void;
}) {
  const { upsertIncomeSource } = useBudget();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(0);
  const [schedule, setSchedule] =
    useState<IncomeSource['schedule']>('monthly_day');
  const [day, setDay] = useState(20);
  const [active, setActive] = useState(true);
  const loadedFor = useRef<IncomeSource | 'new' | null>(null);

  if (!open) loadedFor.current = null;
  if (open && loadedFor.current !== (source ?? 'new')) {
    loadedFor.current = source ?? 'new';
    setName(source?.name ?? '');
    setAmount(source?.amount ?? 0);
    setSchedule(source?.schedule ?? 'monthly_day');
    setDay(source?.dayOfMonth ?? 20);
    setActive(source?.isActive ?? true);
  }

  const submit = async () => {
    const ok = await upsertIncomeSource(
      {
        name,
        amount,
        schedule,
        dayOfMonth: schedule === 'monthly_day' ? day : null,
        isActive: active,
      },
      source?.id,
    );
    if (ok) onClose();
  };

  return (
    <EntitySheet
      open={open}
      onClose={onClose}
      title={source ? 'Изменить источник' : 'Новый источник'}
      onSubmit={submit}
    >
      <TextField
        label="Название"
        value={name}
        onChange={setName}
        placeholder="Зарплата"
      />
      <MoneyField label="Сумма" value={amount} onChange={setAmount} />
      <Field label="График">
        <div className="flex flex-wrap gap-2">
          {(
            [
              ['monthly_day', 'День месяца'],
              ['monthly_last_day', 'Последний день'],
              ['irregular', 'Нерегулярно'],
            ] as const
          ).map(([v, l]) => (
            <button
              key={v}
              type="button"
              onClick={() => setSchedule(v)}
              className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${schedule === v ? 'bg-slate-900 text-white ' : 'bg-slate-100 text-slate-600 '}`}
            >
              {l}
            </button>
          ))}
        </div>
      </Field>
      {schedule === 'monthly_day' && (
        <Field label="День месяца">
          <input
            type="number"
            min={1}
            max={31}
            value={day}
            onChange={(e) =>
              setDay(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))
            }
            className={inputCls}
          />
        </Field>
      )}
      <ActiveToggle checked={active} onChange={setActive} />
    </EntitySheet>
  );
}

function ObligationsSection() {
  const { data, deleteObligation } = useBudget();
  const [editing, setEditing] = useState<Obligation | 'new' | null>(null);
  const expenseCats = data.categories.filter(
    (c) => c.kind === 'expense' && c.parentId === null && !c.isArchived,
  );

  return (
    <div className="space-y-2">
      <p className="px-1 text-xs text-slate-400 ">
        Аренда, подписки, коммуналка. Резервируются из «свободных» до ближайшей
        выплаты.
      </p>
      {data.obligations.length === 0 && <Empty text="Обязательств нет" />}
      {data.obligations.map((o) => (
        <ItemRow
          key={o.id}
          onEdit={() => setEditing(o)}
          onDelete={() => deleteObligation(o.id)}
        >
          <span className="min-w-0 flex-1">
            <span
              className={`block truncate text-[15px] font-semibold ${o.isActive ? 'text-slate-900 ' : 'text-slate-400 line-through '}`}
            >
              {o.name}
            </span>
            <span className="block text-xs text-slate-400">
              {formatMoney(o.amount)} · {o.dayOfMonth}-го числа
              {o.categoryId && categoryById(data, o.categoryId)
                ? ` · ${categoryById(data, o.categoryId)!.name}`
                : ''}
            </span>
          </span>
        </ItemRow>
      ))}
      <AddButton
        onClick={() => setEditing('new')}
        label="Добавить обязательство"
      />
      <ObligationForm
        obligation={editing === 'new' ? null : editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        cats={expenseCats}
      />
    </div>
  );
}

function ObligationForm({
  obligation,
  open,
  onClose,
  cats,
}: {
  obligation: Obligation | null;
  open: boolean;
  onClose: () => void;
  cats: Category[];
}) {
  const { upsertObligation } = useBudget();
  const [name, setName] = useState('');
  const [amount, setAmount] = useState(0);
  const [day, setDay] = useState(10);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [active, setActive] = useState(true);
  const loadedFor = useRef<Obligation | 'new' | null>(null);

  if (!open) loadedFor.current = null;
  if (open && loadedFor.current !== (obligation ?? 'new')) {
    loadedFor.current = obligation ?? 'new';
    setName(obligation?.name ?? '');
    setAmount(obligation?.amount ?? 0);
    setDay(obligation?.dayOfMonth ?? 10);
    setCategoryId(obligation?.categoryId ?? null);
    setActive(obligation?.isActive ?? true);
  }

  const submit = async () => {
    const ok = await upsertObligation(
      { name, amount, dayOfMonth: day, categoryId, isActive: active },
      obligation?.id,
    );
    if (ok) onClose();
  };

  return (
    <EntitySheet
      open={open}
      onClose={onClose}
      title={obligation ? 'Изменить обязательство' : 'Новое обязательство'}
      onSubmit={submit}
    >
      <TextField
        label="Название"
        value={name}
        onChange={setName}
        placeholder="Аренда"
      />
      <MoneyField label="Сумма" value={amount} onChange={setAmount} />
      <Field label="День списания">
        <input
          type="number"
          min={1}
          max={31}
          value={day}
          onChange={(e) =>
            setDay(Math.min(31, Math.max(1, parseInt(e.target.value) || 1)))
          }
          className={inputCls}
        />
      </Field>
      <Field label="Категория (необязательно)">
        <select
          value={categoryId ?? ''}
          onChange={(e) => setCategoryId(e.target.value || null)}
          className={inputCls}
        >
          <option value="">Без категории</option>
          {cats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>
      <ActiveToggle checked={active} onChange={setActive} />
    </EntitySheet>
  );
}

function CategoriesSection() {
  const { data, deleteCategory } = useBudget();
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [editing, setEditing] = useState<Category | 'new' | null>(null);

  const tops = data.categories.filter(
    (c) => c.kind === kind && c.parentId === null,
  );
  const childrenOf = (id: string) =>
    data.categories.filter((c) => c.parentId === id);

  return (
    <div className="space-y-2">
      <div className="flex gap-2 px-1">
        {(['expense', 'income'] as const).map((k) => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`rounded-full px-3 py-1.5 text-[13px] font-semibold transition ${kind === k ? 'bg-slate-900 text-white ' : 'bg-white text-slate-500 ring-1 ring-slate-200 '}`}
          >
            {k === 'expense' ? 'Расходы' : 'Доходы'}
          </button>
        ))}
      </div>
      <p className="px-1 text-xs text-slate-400 ">
        Не больше двух уровней. Расходы в подкатегории уменьшают и её, и
        родительский конверт.
      </p>
      {tops.length === 0 && <Empty text="Категорий нет" />}
      {tops.map((c) => (
        <div key={c.id} className="space-y-1.5">
          <CategoryRow
            cat={c}
            onEdit={() => setEditing(c)}
            onDelete={() => deleteCategory(c.id)}
            depth={0}
          />
          {childrenOf(c.id).map((ch) => (
            <CategoryRow
              key={ch.id}
              cat={ch}
              onEdit={() => setEditing(ch)}
              onDelete={() => deleteCategory(ch.id)}
              depth={1}
            />
          ))}
        </div>
      ))}
      <AddButton onClick={() => setEditing('new')} label="Добавить категорию" />
      <CategoryForm
        category={editing === 'new' ? null : editing}
        kind={kind}
        open={editing !== null}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function CategoryRow({
  cat,
  onEdit,
  onDelete,
  depth,
}: {
  cat: Category;
  onEdit: () => void;
  onDelete: () => void;
  depth: number;
}) {
  const env = useBudget().data.envelopes.find((e) => e.categoryId === cat.id);
  return (
    <div
      style={{ paddingLeft: 12 + depth * 18 }}
      className="flex items-center gap-1 rounded-2xl bg-white py-2 pr-3 shadow-sm ring-1 ring-slate-100"
    >
      <button
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center gap-3 text-left"
      >
        <CategoryIcon category={cat} size={15} />
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[14px] font-semibold ${cat.isArchived ? 'text-slate-400 line-through ' : 'text-slate-900 '}`}
          >
            {cat.name}
          </span>
          {env && (
            <span className="block text-[11px] text-emerald-600 dark:text-emerald-400">
              конверт {formatMoney(env.limitAmount)}
            </span>
          )}
        </span>
        {cat.isArchived && (
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-400 ">
            архив
          </span>
        )}
      </button>
      <IconBtn onClick={onEdit} title="Изменить">
        <Pencil size={14} />
      </IconBtn>
      <IconBtn onClick={onDelete} title={isDemoMode ? 'Удалить' : 'В архив'} danger>
        <Trash2 size={14} />
      </IconBtn>
    </div>
  );
}

function CategoryForm({
  category,
  kind,
  open,
  onClose,
}: {
  category: Category | null;
  kind: 'expense' | 'income';
  open: boolean;
  onClose: () => void;
}) {
  const { createCategory, updateCategory, data } = useBudget();
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState<string | null>(null);
  const [color, setColor] = useState('#34a06a');
  const [icon, setIcon] = useState('');
  const [archived, setArchived] = useState(false);
  const [error, setError] = useState('');
  const loadedFor = useRef<Category | 'new' | null>(null);

  const allParents = useMemo(
    () =>
      data.categories.filter(
        (c) => c.kind === kind && c.parentId === null && c.id !== category?.id,
      ),
    [data, kind, category],
  );

  if (!open) loadedFor.current = null;
  if (open && loadedFor.current !== (category ?? 'new')) {
    loadedFor.current = category ?? 'new';
    setName(category?.name ?? '');
    setParentId(category?.parentId ?? null);
    setColor(category?.color ?? '#34a06a');
    setIcon(category?.icon ?? '');
    setArchived(category?.isArchived ?? false);
    setError('');
  }

  const submit = async () => {
    setError('');
    try {
      validateCategoryInput(data, { name, kind, parentId, color });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка');
      return;
    }
    const ok = await (category
      ? updateCategory(category.id, {
          name,
          parentId,
          color,
          icon,
          isArchived: archived,
        })
      : createCategory({ name, kind, parentId, color, icon }));
    if (ok) onClose();
  };

  return (
    <EntitySheet
      open={open}
      onClose={onClose}
      title={category ? 'Изменить категорию' : 'Новая категория'}
      onSubmit={submit}
    >
      <TextField
        label="Название"
        value={name}
        onChange={setName}
        placeholder={kind === 'expense' ? 'Продукты' : 'Фриланс'}
      />
      <Field label="Родитель (для подкатегории)">
        <select
          value={parentId ?? ''}
          onChange={(e) => setParentId(e.target.value || null)}
          className={inputCls}
        >
          <option value="">Без родителя (верхний уровень)</option>
          {allParents
            .filter((p) => !category || p.parentId === null)
            .map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
      </Field>
      <ColorPicker value={color} onChange={setColor} colors={CATEGORY_COLORS} />
      <Field label="Иконка">
        <div className="grid grid-cols-6 gap-1.5">
          {ICON_CHOICES.map((ic) => (
            <button
              key={ic}
              type="button"
              onClick={() => setIcon(icon === ic ? '' : ic)}
              className={`flex h-10 items-center justify-center rounded-xl transition ${icon === ic ? 'bg-emerald-100 ring-2 ring-emerald-400 dark:bg-emerald-500/20' : 'bg-slate-100 hover:bg-slate-200 '}`}
            >
              <CategoryIcon
                icon={ic}
                color={icon === ic ? '#059669' : '#94a3b8'}
                size={16}
              />
            </button>
          ))}
        </div>
      </Field>
      {category && (
        <ActiveToggle checked={!archived} onChange={(v) => setArchived(!v)} />
      )}
      {error && (
        <p className="rounded-xl bg-red-50 px-3 py-2 text-[13px] font-medium text-red-600 dark:bg-red-500/10 dark:text-red-300">
          {error}
        </p>
      )}
    </EntitySheet>
  );
}

function EnvelopesSection() {
  const { data } = useBudget();
  const periods = data.periods.map((p) => p.id);
  const [periodId, setPeriodId] = useState<string>(
    activePeriod(data)?.id ?? periods[0],
  );
  const views = useMemo(() => envelopeViews(data, periodId), [data, periodId]);
  const [editing, setEditing] = useState<{
    categoryId: string;
    limit: number;
  } | null>(null);

  const period = data.periods.find((p) => p.id === periodId);
  const idx = periods.indexOf(periodId);
  const missingCategories = period?.status === 'active'
    ? data.categories.filter((category) =>
        category.kind === 'expense' && !category.parentId && !category.isArchived
        && !views.some((view) => view.categoryId === category.id))
    : [];

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between rounded-2xl bg-white px-3 py-2 shadow-sm ring-1 ring-slate-100 ">
        <button
          disabled={idx <= 0}
          onClick={() => setPeriodId(periods[idx - 1])}
          className="rounded-xl p-1.5 text-slate-400 disabled:opacity-30 "
        >
          ←
        </button>
        <span className="text-sm font-bold text-slate-900 ">
          {period ? formatMonth(period.id) : periodId}
        </span>
        <button
          disabled={idx >= periods.length - 1}
          onClick={() => setPeriodId(periods[idx + 1])}
          className="rounded-xl p-1.5 text-slate-400 disabled:opacity-30 "
        >
          →
        </button>
      </div>
      <p className="px-1 text-xs text-slate-400 ">
        Лимит — это план на месяц. Переносы с прошлого месяца добавляются
        автоматически при разборе.
      </p>
      {views.length === 0 && <Empty text="В этом периоде нет конвертов" />}
      {views.map((v) => {
        const cat = categoryById(data, v.categoryId);
        return (
          <div
            key={v.id}
            className="flex items-center gap-3 rounded-2xl bg-white px-3 py-2.5 shadow-sm ring-1 ring-slate-100 "
          >
            <CategoryIcon category={cat} size={15} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-semibold text-slate-900 ">
                {cat?.name}
              </span>
              <span className="block text-[11px] text-slate-400">
                потрачено {formatMoney(v.spent)}
                {v.carryOverAmount > 0 &&
                  ` · перенос ${formatMoney(v.carryOverAmount)}`}
              </span>
            </span>
            <button
              onClick={() =>
                setEditing({ categoryId: v.categoryId, limit: v.limitAmount })
              }
              className="rounded-xl bg-slate-100 px-3 py-1.5 text-[13px] font-bold tabular-nums text-slate-700 transition hover:bg-emerald-50 hover:text-emerald-700 "
            >
              {formatMoney(v.limitAmount)}
            </button>
          </div>
        );
      })}
      {missingCategories.length > 0 && (
        <div className="space-y-2 pt-2">
          <h3 className="text-sm font-bold text-slate-900">Новый конверт</h3>
          {missingCategories.map((category) => (
            <AddButton
              key={category.id}
              label={category.name}
              onClick={() => setEditing({ categoryId: category.id, limit: 0 })}
            />
          ))}
        </div>
      )}
      <EnvelopeLimitSheet
        editing={editing}
        periodId={periodId}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

function EnvelopeLimitSheet({
  editing,
  periodId,
  onClose,
}: {
  editing: { categoryId: string; limit: number } | null;
  periodId: string;
  onClose: () => void;
}) {
  const { data, setEnvelopeLimit } = useBudget();
  const [limit, setLimit] = useState(0);
  const loadedFor = useRef<string | null>(null);
  const key = editing ? `${editing.categoryId}:${editing.limit}` : null;
  if (key !== loadedFor.current) {
    loadedFor.current = key;
    setLimit(editing?.limit ?? 0);
  }
  const cat = editing ? categoryById(data, editing.categoryId) : undefined;
  const submit = async () => {
    if (!editing) return;
    const ok = await setEnvelopeLimit(editing.categoryId, limit, periodId);
    if (ok) onClose();
  };
  return (
    <EntitySheet
      open={!!editing}
      onClose={onClose}
      title={`Лимит: ${cat?.name ?? ''}`}
      onSubmit={submit}
    >
      <MoneyField
        label="Лимит на месяц"
        value={limit}
        onChange={setLimit}
        allowZero
      />
      <p className="text-xs text-slate-400 ">
        0 — конверт без лимита (расходы всё равно учитываются).
      </p>
    </EntitySheet>
  );
}

function DataSection() {
  const { exportSnapshot, importSnapshot, resetData, data } = useBudget();
  const fileRef = useRef<HTMLInputElement>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  const onExport = () => {
    const blob = new Blob([exportSnapshot()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `savemoney-${TODAY}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = (file: File) => {
    if (!window.confirm('Заменить текущий бюджет данными из выбранного файла?')) return;
    const reader = new FileReader();
    reader.onload = () => {
      const text = typeof reader.result === 'string' ? reader.result : '';
      importSnapshot(text);
    };
    reader.readAsText(file);
  };

  return (
    <div className="space-y-3">
      <div className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-100 ">
        <div className="text-[15px] font-bold text-slate-900 ">
          Резервная копия
        </div>
        <p className="mt-1 text-xs text-slate-400 ">
          {data.transactions.length} операций · {data.categories.length}{' '}
          категорий · {data.goals.length} целей
        </p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            onClick={onExport}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-200 "
          >
            <Download size={15} /> Экспорт JSON
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-xl bg-slate-100 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-200 "
          >
            <Upload size={15} /> Импорт JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = '';
            }}
          />
        </div>
        <p className="mt-2 text-[11px] text-slate-400 ">
          Импорт полностью заменяет бюджет после проверки ссылок.
        </p>
      </div>

      <div className="rounded-2xl bg-red-50 p-4 ring-1 ring-red-100 dark:bg-red-500/10 dark:ring-red-500/20">
        <div className="text-[15px] font-bold text-red-600 dark:text-red-300">
          Опасная зона
        </div>
        <p className="mt-1 text-xs text-red-500/80 dark:text-red-300/70">
          {isDemoMode
            ? 'Заменит ваши изменения исходными демоданными.'
            : 'Удалит все данные и вернёт настройки по умолчанию.'}
        </p>
        {confirmReset ? (
          <div className="mt-3 flex gap-2">
            <button
              onClick={async () => {
                if (await resetData()) setConfirmReset(false);
              }}
              className="flex-1 rounded-xl bg-red-500 py-2.5 text-sm font-bold text-white"
            >
              {isDemoMode ? 'Восстановить демо' : 'Точно удалить'}
            </button>
            <button
              onClick={() => setConfirmReset(false)}
              className="flex-1 rounded-xl bg-white py-2.5 text-sm font-bold text-slate-600 "
            >
              Отмена
            </button>
          </div>
        ) : (
          <button
            onClick={() => setConfirmReset(true)}
            className="mt-3 w-full rounded-xl bg-red-100 py-2.5 text-sm font-bold text-red-600 dark:bg-red-500/20 dark:text-red-200"
          >
            Сбросить все данные
          </button>
        )}
      </div>
    </div>
  );
}
