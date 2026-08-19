import './styles.css';
import { h } from '../../ui/dom';
import type { UIActions } from '../../ui/actions';
import type { AppState } from '../../state/store';
import type { StepView } from '../../ui/steps';
import { currentRevision, conceptAsset } from '../domain/state-machine';
import type {
  ConceptView,
  FeelId,
  IdentityPhoto,
  UserIdentity,
  WorldArchetype,
  WorldformBuild,
  WorldformStatus,
} from '../domain/types';
import { worldformRuntime } from '../runtime';
import { prepareIdentityPhoto } from './photo';

const FEELINGS: readonly { id: FeelId; label: string }[] = [
  { id: 'powerful', label: 'Mạnh mẽ' },
  { id: 'free', label: 'Tự do' },
  { id: 'mysterious', label: 'Bí ẩn' },
  { id: 'protected', label: 'Được bảo vệ' },
  { id: 'fearless', label: 'Không sợ hãi' },
  { id: 'elegant', label: 'Thanh lịch' },
  { id: 'wild', label: 'Hoang dã' },
  { id: 'calm', label: 'Điềm tĩnh' },
  { id: 'unpredictable', label: 'Khó đoán' },
];

const PROGRESS = [
  { label: 'Identity', min: 0 },
  { label: 'Front', min: 1 },
  { label: 'Multiview', min: 2 },
  { label: '3D', min: 3 },
  { label: 'QC', min: 4 },
] as const;

function phase(status: WorldformStatus): number {
  if (status === 'DRAFT' || status === 'IDENTITY_READY') return 0;
  if (status === 'ROLE_SELECTED' || status === 'FRONT_GENERATING' || status === 'FRONT_REVIEW') return 1;
  if (status === 'MULTIVIEW_GENERATING' || status === 'MULTIVIEW_REVIEW') return 2;
  if (status === 'MODEL_GENERATING') return 3;
  if (status === 'MODEL_QC' || status === 'MANUFACTURING_REVIEW' || status === 'APPROVED') return 4;
  return 0;
}

function button(
  label: string,
  action: () => void,
  options: { primary?: boolean; quiet?: boolean; disabled?: boolean; testId?: string } = {}
): HTMLButtonElement {
  return h(
    'button',
    {
      class: `wf-button${options.primary ? ' is-primary' : ''}${options.quiet ? ' is-quiet' : ''}`,
      disabled: options.disabled,
      'data-testid': options.testId,
      onClick: action,
    },
    label
  ) as HTMLButtonElement;
}

function textInput(
  label: string,
  value: string,
  onInput: (value: string) => void,
  placeholder: string,
  multiline = false
): HTMLElement[] {
  const input = h(multiline ? 'textarea' : 'input', {
    class: multiline ? 'wf-textarea' : 'wf-input',
    value,
    placeholder,
    'aria-label': label,
  }) as HTMLInputElement | HTMLTextAreaElement;
  input.value = value;
  input.addEventListener('input', () => onInput(input.value));
  return [h('label', { class: 'wf-section-label' }, label), input];
}

function statusCard(kicker: string, heading: string, message: string): HTMLElement {
  return h(
    'div',
    { class: 'wf-status' },
    h(
      'div',
      {},
      h('div', { class: 'wf-spinner', 'aria-hidden': 'true' }),
      h('p', { class: 'wf-kicker' }, kicker),
      h('h2', { class: 'wf-heading' }, heading),
      h('p', {}, message)
    )
  );
}

export function worldformStep(actions: UIActions, appState: AppState): StepView {
  const runtime = worldformRuntime();
  const orchestrator = runtime.orchestrator;
  let buildId = orchestrator.latestBuild().id;
  let build = orchestrator.get(buildId);
  let busy = false;
  let error = '';
  let editingIdentity = build.status === 'DRAFT';
  let choosingRole = build.status === 'IDENTITY_READY';
  let preparedPhoto: IdentityPhoto | null = build.identity?.photo ?? null;
  let desiredSelf = build.identity?.desiredSelf.description ?? '';
  let recognitionCues = build.identity?.appearance.recognitionCues.join(', ') ?? '';
  let hair = build.identity?.appearance.hair ?? '';
  let eyewear = build.identity?.appearance.eyewear ?? '';
  let feelings = new Set<FeelId>(build.identity?.desiredSelf.feelings ?? []);
  let timer: number | null = null;
  let displayCharacterId = appState.characterId;

  const content = h('main', { class: 'wf-card' });
  const progress = h('div', { class: 'wf-progress', 'aria-label': 'Tiến trình Worldform' });
  const buildLabel = h('span');
  const modeLabel = h(
    'span',
    { class: `wf-mode${runtime.mode === 'live' ? ' is-live' : ''}` },
    runtime.mode === 'live' ? 'LIVE PROVIDERS' : 'LOCAL MOCK'
  );
  const el = h(
    'section',
    {
      class: 'step step-worldform',
      'aria-label': 'Afterburn Worldform Studio',
      'data-testid': 'worldform-root',
    },
    h(
      'div',
      { class: 'wf-shell' },
      h(
        'div',
        { class: 'wf-meta' },
        buildLabel,
        h(
          'div',
          { class: 'wf-meta-right' },
          modeLabel,
          h(
            'button',
            {
              class: 'wf-new',
              onClick: () => {
                const next = orchestrator.createBuild();
                buildId = next.id;
                build = next;
                preparedPhoto = null;
                desiredSelf = '';
                recognitionCues = '';
                hair = '';
                eyewear = '';
                feelings = new Set();
                editingIdentity = true;
                choosingRole = false;
                error = '';
                render();
              },
            },
            'Build mới'
          )
        )
      ),
      progress,
      content
    )
  );

  const selectedArchetype = (): WorldArchetype | null =>
    orchestrator.worldPack.archetypes.find((item) => item.id === build.selectedArchetypeId) ?? null;

  const syncStageCharacter = () => {
    const archetype = selectedArchetype();
    if (archetype && displayCharacterId !== archetype.prototypeCharacterId) {
      displayCharacterId = archetype.prototypeCharacterId;
      actions.selectCharacter(archetype.prototypeCharacterId);
    }
  };

  const schedule = (delay: number, action: () => void) => {
    if (timer !== null || busy) return;
    timer = window.setTimeout(() => {
      timer = null;
      action();
    }, delay);
  };

  const run = async (work: () => WorldformBuild | Promise<WorldformBuild>): Promise<void> => {
    if (busy) return;
    busy = true;
    error = '';
    render();
    try {
      build = await work();
      buildId = build.id;
    } catch (cause) {
      error = cause instanceof Error ? cause.message : 'Không thể hoàn tất bước này.';
      build = orchestrator.get(buildId);
    } finally {
      busy = false;
      render();
    }
  };

  const renderProgress = () => {
    const active = phase(build.status === 'FAILED' && build.failure ? build.failure.retryStatus : build.status);
    progress.replaceChildren(
      ...PROGRESS.map((item, index) =>
        h(
          'div',
          {
            class: `wf-progress-item${index < active ? ' is-done' : ''}${index === active ? ' is-active' : ''}`,
          },
          h('span', { class: 'wf-progress-line' }),
          h('span', { class: 'wf-progress-label' }, item.label)
        )
      )
    );
  };

  const identityForm = (): HTMLElement => {
    const fileInput = h('input', {
      type: 'file',
      accept: 'image/jpeg,image/png,image/webp',
      hidden: true,
      'data-testid': 'worldform-photo',
    }) as HTMLInputElement;
    const preview = preparedPhoto
      ? h('img', { class: 'wf-photo-preview', src: preparedPhoto.dataUri, alt: 'Ảnh identity đã chọn' })
      : h('div', { class: 'wf-photo-preview', 'aria-hidden': 'true' });
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      void run(async () => {
        preparedPhoto = await prepareIdentityPhoto(file);
        return orchestrator.get(buildId);
      });
    });

    const feelingButtons = FEELINGS.map((feeling) => {
      const selected = feelings.has(feeling.id);
      return h(
        'button',
        {
          class: 'wf-chip',
          type: 'button',
          'aria-pressed': String(selected),
          disabled: !selected && feelings.size >= 3,
          onClick: () => {
            if (feelings.has(feeling.id)) feelings.delete(feeling.id);
            else if (feelings.size < 3) feelings.add(feeling.id);
            render();
          },
        },
        feeling.label
      );
    });

    const submit = () => {
      if (!preparedPhoto) {
        error = 'Hãy thêm một ảnh rõ, có một người chính.';
        render();
        return;
      }
      const identity: UserIdentity = {
        photo: preparedPhoto,
        appearance: {
          recognitionCues: recognitionCues
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean)
            .slice(0, 6),
          hair: hair.trim() || undefined,
          eyewear: eyewear.trim() || undefined,
        },
        desiredSelf: { description: desiredSelf.trim(), feelings: [...feelings] },
      };
      void run(() => {
        const next = orchestrator.setIdentity(buildId, identity);
        editingIdentity = false;
        choosingRole = true;
        return next;
      });
    };

    return h(
      'div',
      { 'data-testid': 'worldform-identity' },
      h('p', { class: 'wf-kicker' }, '01 / Identity'),
      h('h1', { class: 'wf-heading' }, 'Anh sẽ là ai nếu tồn tại ở đây?'),
      h('p', { class: 'wf-lead' }, 'Ảnh giữ những dấu hiệu nhận ra anh. Afterburn City sẽ biến phần còn lại thành một vai thuộc về thế giới này.'),
      h(
        'label',
        { class: 'wf-photo-picker' },
        preview,
        h(
          'span',
          { class: 'wf-photo-copy' },
          h('strong', {}, preparedPhoto ? 'Đổi ảnh identity' : 'Thêm ảnh identity'),
          h('span', {}, 'Một người chính · JPG, PNG hoặc WebP · ảnh được thu nhỏ trước khi lưu local')
        ),
        fileInput
      ),
      ...textInput(
        'Anh muốn trở thành người thế nào ở đây?',
        desiredSelf,
        (value) => (desiredSelf = value),
        'Một người đi một mình nhưng luôn bảo vệ người khác.',
        true
      ),
      h('span', { class: 'wf-section-label' }, 'Anh muốn cảm thấy thế nào? · chọn tối đa 3'),
      h('div', { class: 'wf-chip-grid' }, ...feelingButtons),
      h(
        'div',
        { class: 'wf-two-col' },
        h('div', {}, ...textInput('Dấu hiệu nhận ra anh', recognitionCues, (value) => (recognitionCues = value), 'Kính tròn, nốt ruồi, khuyên tai — ngăn cách bằng dấu phẩy')),
        h('div', {}, ...textInput('Tóc', hair, (value) => (hair = value), 'Tóc đen ngắn, nhiều lớp'))
      ),
      ...textInput('Kính', eyewear, (value) => (eyewear = value), 'Kính tròn mảnh — có thể để trống'),
      error ? h('p', { class: 'wf-error', role: 'alert' }, error) : null,
      h(
        'div',
        { class: 'wf-actions' },
        button('Xem con đường của anh', submit, {
          primary: true,
          disabled: busy,
          testId: 'worldform-identity-submit',
        })
      )
    );
  };

  const roleReview = (): HTMLElement => {
    const recommendations = build.recommendations.length
      ? build.recommendations
      : build.identity
        ? orchestrator.worldPack.archetypes.slice(0, 3).map((archetype, index) => ({
            archetypeId: archetype.id,
            rationale: archetype.rationale,
            rank: index + 1,
          }))
        : [];
    const cards = recommendations.map((recommendation) => {
      const archetype = orchestrator.worldPack.archetypes.find(
        (item) => item.id === recommendation.archetypeId
      )!;
      return h(
        'button',
        {
          class: 'wf-role',
          'data-testid': `worldform-role-${archetype.id}`,
          onClick: () => {
            void run(() => {
              const next = orchestrator.selectArchetype(buildId, archetype.id);
              choosingRole = false;
              actions.selectCharacter(archetype.prototypeCharacterId);
              return next;
            });
          },
        },
        h('span', { class: 'wf-rank' }, recommendation.rank === 1 ? 'Con đường đầu tiên' : `Con đường ${recommendation.rank}`),
        h('h3', {}, archetype.name),
        h('p', {}, recommendation.rationale),
        h(
          'div',
          { class: 'wf-role-spec' },
          h('span', {}, `BODY · ${archetype.worldBody.name}`),
          h(
            'span',
            {},
            `SIGNATURE · ${archetype.signatureKit.hero.type.replace('_', ' ')} · ${archetype.signatureKit.hero.name}`
          )
        )
      );
    });
    return h(
      'div',
      { 'data-testid': 'worldform-role' },
      h('p', { class: 'wf-kicker' }, '02 / Role interpretation'),
      h('h2', { class: 'wf-heading' }, 'Chúng tôi thấy anh ở những con đường này.'),
      h('p', { class: 'wf-lead' }, 'Không có phần trăm giả. Mỗi lựa chọn khóa một World Body platform và đúng một hero Signature Asset thuộc Afterburn City.'),
      h('div', { class: 'wf-role-grid' }, ...cards),
      h(
        'div',
        { class: 'wf-actions' },
        button('Sửa identity', () => {
          editingIdentity = true;
          choosingRole = false;
          render();
        }, { quiet: true })
      )
    );
  };

  const roleSelected = (): HTMLElement => {
    const archetype = selectedArchetype()!;
    return h(
      'div',
      { 'data-testid': 'worldform-front-ready' },
      h('p', { class: 'wf-kicker' }, '03 / Front concept'),
      h('h2', { class: 'wf-heading' }, `Trở thành ${archetype.name}.`),
      h('p', { class: 'wf-lead' }, `${archetype.fantasy} Face giữ identity; ${archetype.worldBody.name} là vai anh trở thành; ${archetype.signatureKit.hero.name} là dấu hiệu anh thuộc Afterburn City.`),
      h('p', { class: 'wf-notice' }, `MAS v${orchestrator.worldPack.attachmentSystem.version}: Head Dock có orientation key; Signature Kit ráp qua ${archetype.signatureKit.hero.portIds.join(' + ')}. Các hardpoint phải được giấu và body vẫn hoàn chỉnh khi tháo asset.`),
      h('div', { class: 'wf-notice' }, runtime.mode === 'mock' ? 'Đang dùng mock deterministic để flow chạy local không tốn provider. Bật live providers bằng biến môi trường khi FAL và Meshy đã cấu hình.' : 'Live provider mode: lần gọi tiếp theo có thể tiêu provider units.'),
      error ? h('p', { class: 'wf-error', role: 'alert' }, error) : null,
      h(
        'div',
        { class: 'wf-actions' },
        button('Dựng front', () => void run(() => orchestrator.generateFront(buildId)), {
          primary: true,
          disabled: busy,
          testId: 'worldform-front-generate',
        }),
        button('Chọn con đường khác', () => {
          choosingRole = true;
          render();
        }, { quiet: true })
      )
    );
  };

  const frontReview = (): HTMLElement => {
    const revision = currentRevision(build)!;
    const front = conceptAsset(revision, 'front')!;
    const remaining = build.frontPreviewLimit - build.successfulFrontPreviews;
    return h(
      'div',
      { 'data-testid': 'worldform-front-review' },
      h('p', { class: 'wf-kicker' }, `04 / Front review · Revision ${String(revision.number).padStart(2, '0')}`),
      h(
        'div',
        { class: 'wf-preview-wrap' },
        h('img', { class: 'wf-preview', src: front.uri, alt: 'Front figurine preview' }),
        h(
          'div',
          {},
          h('h2', { class: 'wf-heading' }, 'Đây có phải anh ở Afterburn?'),
          h('p', { class: 'wf-lead' }, `Duyệt đồng thời face identity, World Body và một hero Signature Asset. Chỉ sau đó side/back mới được chạy. Còn ${remaining} preview provider thành công trong quota.`),
          error ? h('p', { class: 'wf-error', role: 'alert' }, error) : null,
          h(
            'div',
            { class: 'wf-actions' },
            button('Đúng là tôi · dựng side + back', () => {
              void run(async () => {
                // Worldform chưa mount vào main app — khi mount, gọi GPU burst qua UIActions hook để celebrate gate này.
                orchestrator.approveFront(buildId);
                return orchestrator.generateMultiview(buildId);
              });
            }, { primary: true, disabled: busy, testId: 'worldform-front-approve' }),
            button('Thử phiên bản khác', () => void run(() => orchestrator.generateFront(buildId)), {
              disabled: busy || remaining <= 0,
            }),
            button('Đổi vai', () => {
              choosingRole = true;
              render();
            }, { quiet: true }),
            button('Sửa identity', () => {
              editingIdentity = true;
              render();
            }, { quiet: true })
          )
        )
      )
    );
  };

  const multiviewReview = (): HTMLElement => {
    const revision = currentRevision(build)!;
    const views: ConceptView[] = ['front', 'side', 'back'];
    return h(
      'div',
      { 'data-testid': 'worldform-multiview-review' },
      h('p', { class: 'wf-kicker' }, `05 / Multiview review · Revision ${String(revision.number).padStart(2, '0')}`),
      h('h2', { class: 'wf-heading' }, 'Ba góc. Một nhân vật.'),
      h('p', { class: 'wf-lead' }, 'Front là source of truth cho face, body, Signature Kit và vị trí hardpoint. Nếu một góc lệch, chỉ dựng lại góc đó trong revision mới.'),
      h(
        'div',
        { class: 'wf-view-grid' },
        ...views.map((view) => {
          const asset = conceptAsset(revision, view)!;
          return h(
            'figure',
            { class: 'wf-view' },
            h('img', { src: asset.uri, alt: `${view} concept view` }),
            h(
              'figcaption',
              {},
              h('span', {}, view),
              view === 'front'
                ? h('span', {}, 'canonical')
                : h(
                    'button',
                    {
                      disabled: busy,
                      onClick: () => void run(() => orchestrator.retryView(buildId, view)),
                    },
                    'Dựng lại'
                  )
            )
          );
        })
      ),
      error ? h('p', { class: 'wf-error', role: 'alert' }, error) : null,
      h(
        'div',
        { class: 'wf-actions' },
        button('Duyệt multiview · tạo 3D', () => {
          void run(async () => {
            // Worldform chưa mount vào main app — khi mount, gọi GPU burst qua UIActions hook để celebrate gate này.
            orchestrator.approveMultiview(buildId);
            return orchestrator.startModel(buildId);
          });
        }, { primary: true, disabled: busy, testId: 'worldform-multiview-approve' })
      )
    );
  };

  const manufacturingReview = (): HTMLElement => {
    const revision = currentRevision(build)!;
    const qc = revision.qc!;
    const archetype = selectedArchetype()!;
    const preview = revision.assets.find((asset) => asset.kind === 'model-preview');
    const knownCost = build.usage.reduce(
      (sum, item) => sum + (item.estimatedCostUsd ?? 0),
      0
    );
    const units = build.usage.reduce((sum, item) => sum + item.providerUnits, 0);
    return h(
      'div',
      { 'data-testid': 'worldform-manufacturing-review' },
      h('p', { class: 'wf-kicker' }, '08 / QC + manufacturing review'),
      h('h2', { class: 'wf-heading' }, qc.overall === 'fail' ? 'Model cần sửa trước khi review.' : 'Model đã tạo. Chưa phải print-ready.'),
      h('p', { class: 'wf-lead' }, 'QC tự động chỉ ghi bằng chứng kỹ thuật. Manufacturing approval vẫn cần người và factory profile đã xác nhận.'),
      preview ? h('img', { class: 'wf-preview', src: preview.uri, alt: '3D model preview' }) : null,
      h(
        'div',
        { class: 'wf-qc-grid' },
        h('div', { class: 'wf-qc-item' }, h('span', {}, 'Base'), h('strong', {}, qc.dimensions.baseDiameterMm === null ? 'Chưa rõ' : `${qc.dimensions.baseDiameterMm.toFixed(1)} mm`)),
        h('div', { class: 'wf-qc-item' }, h('span', {}, 'Height'), h('strong', {}, qc.dimensions.heightMm === null ? 'Chưa rõ' : `${qc.dimensions.heightMm.toFixed(1)} mm`)),
        h('div', { class: 'wf-qc-item' }, h('span', {}, 'Mesh'), h('strong', {}, qc.mesh.exists ? 'Đã đọc' : 'Không hợp lệ')),
        h('div', { class: 'wf-qc-item' }, h('span', {}, 'MAS config'), h('strong', {}, qc.modularity.configuration === 'pass' ? 'Hợp lệ' : qc.modularity.configuration === 'fail' ? 'Lỗi' : 'Chưa đo')),
        h('div', { class: 'wf-qc-item' }, h('span', {}, 'Connector fit'), h('strong', {}, qc.modularity.connectorFit === 'unknown' ? 'Factory test' : qc.modularity.connectorFit)),
        h('div', { class: 'wf-qc-item' }, h('span', {}, 'Provider usage'), h('strong', {}, `${units} units · $${knownCost.toFixed(2)}`))
      ),
      h(
        'p',
        { class: 'wf-notice' },
        `${archetype.worldBody.name} + ${archetype.signatureKit.name}. Hero asset: ${archetype.signatureKit.hero.name} qua ${archetype.signatureKit.hero.portIds.join(' + ')}. Mock GLB chỉ kiểm tra flow/mesh; không phải bằng chứng connector đã sản xuất được.`
      ),
      qc.warnings.length
        ? h('ul', { class: 'wf-warning-list' }, ...qc.warnings.map((warning) => h('li', {}, warning)))
        : h('p', { class: 'wf-notice' }, 'QC tự động không thấy lỗi trong những phép kiểm tra đáng tin cậy.'),
      h('p', { class: 'wf-notice' }, orchestrator.worldPack.rights.commercialUse ? 'World Pack cho phép commercial flow, nhưng checkout vẫn nằm ngoài v0.1.' : 'Export sản xuất và checkout bị khoá: World Pack này chưa bật commercialUse.'),
      h(
        'div',
        { class: 'wf-actions' },
        build.manualReview.status === 'not-requested'
          ? button('Gửi manufacturing review', () => void run(() => orchestrator.requestManufacturingReview(buildId)), {
              primary: true,
              disabled: busy,
              testId: 'worldform-request-review',
            })
          : h('span', { class: 'wf-notice' }, build.manualReview.status === 'requested' ? 'Đã ghi nhận yêu cầu review.' : `Manufacturing: ${build.manualReview.status}`),
        button('Export bị khoá', () => undefined, { disabled: true })
      )
    );
  };

  const failure = (): HTMLElement => {
    const retry = () => {
      void run(async () => {
        const recovered = orchestrator.retryFailure(buildId);
        if (recovered.status === 'ROLE_SELECTED' || recovered.status === 'FRONT_REVIEW') {
          return orchestrator.generateFront(buildId);
        }
        if (recovered.status === 'MULTIVIEW_GENERATING') {
          return orchestrator.generateMultiview(buildId);
        }
        if (recovered.status === 'MULTIVIEW_REVIEW') {
          return orchestrator.startModel(buildId);
        }
        if (recovered.status === 'MODEL_QC') {
          return orchestrator.runQC(buildId);
        }
        return recovered;
      });
    };
    return h(
      'div',
      { 'data-testid': 'worldform-failed' },
      h('p', { class: 'wf-kicker' }, 'Generation paused'),
      h('h2', { class: 'wf-heading' }, 'Bước này chưa hoàn tất.'),
      h('p', { class: 'wf-lead' }, build.failure?.message ?? 'Lỗi không xác định.'),
      h('p', { class: 'wf-notice' }, 'Provider failure không tiêu preview quota. Những asset đã duyệt vẫn được giữ nguyên.'),
      h('div', { class: 'wf-actions' }, button('Thử lại đúng bước này', retry, { primary: true, disabled: busy }))
    );
  };

  function render(): void {
    build = orchestrator.get(buildId);
    syncStageCharacter();
    buildLabel.textContent = `${build.id} · ${orchestrator.worldPack.displayName} v${build.worldPackVersion}`;
    renderProgress();

    let next: HTMLElement;
    if (editingIdentity || build.status === 'DRAFT') {
      next = identityForm();
    } else if (choosingRole || build.status === 'IDENTITY_READY') {
      next = roleReview();
    } else if (build.status === 'ROLE_SELECTED') {
      next = roleSelected();
    } else if (build.status === 'FRONT_GENERATING') {
      next = statusCard('Front generation', 'Đang dựng đúng một front.', 'Side và back vẫn bị khoá. Provider failure sẽ không trừ quota.');
    } else if (build.status === 'FRONT_REVIEW') {
      next = frontReview();
    } else if (build.status === 'MULTIVIEW_GENERATING') {
      next = statusCard('Multiview generation', 'Đang giữ front làm source of truth.', 'Side và back là hai asset độc lập; không tạo character sheet hoặc collage.');
    } else if (build.status === 'MULTIVIEW_REVIEW') {
      next = multiviewReview();
    } else if (build.status === 'MODEL_GENERATING') {
      next = statusCard('3D generation', 'Job 3D đang chạy nền.', 'Front, side và back đã được duyệt. Trang có thể resume từ build đã persist.');
      schedule(runtime.mode === 'mock' ? 60 : 2400, () => void run(() => orchestrator.pollModel(buildId)));
    } else if (build.status === 'MODEL_QC') {
      next = statusCard('Model QC', 'Đang đo những gì có thể chứng minh.', 'Thông số factory chưa cung cấp vẫn để unknown; hệ thống không tự invent.');
      schedule(60, () => void run(() => orchestrator.runQC(buildId)));
    } else if (build.status === 'MANUFACTURING_REVIEW') {
      next = manufacturingReview();
    } else if (build.status === 'APPROVED') {
      next = h('div', {}, h('p', { class: 'wf-kicker' }, 'Approved'), h('h2', { class: 'wf-heading' }, 'Worldform đã được manufacturing review.'), h('p', { class: 'wf-lead' }, 'Approval này đến từ quyết định review riêng, không phải QC tự động.'));
    } else {
      next = failure();
    }
    content.replaceChildren(next);
  }

  render();
  return {
    el,
    update() {
      // Worldform owns its persisted aggregate. AppState updates only reframe
      // the existing Three.js display sculpt and do not remount this flow.
    },
    destroy() {
      if (timer !== null) window.clearTimeout(timer);
    },
  };
}
