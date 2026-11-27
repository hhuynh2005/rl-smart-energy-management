"""Giao diện kết quả SAC từ Colab; chỉ suy luận từ checkpoint đã lưu.

Chạy: python -m streamlit run dashboard_sac.py --server.address 127.0.0.1
"""
from copy import deepcopy
from html import escape
from pathlib import Path

import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st
from plotly.subplots import make_subplots

from sac_results import (
    METHOD_NAMES, SCENARIO_NAMES, cost_comparison, discover_experiments,
    evaluation, evaluation_available, integrity_checks, learning_logs, read_json, seed_summary,
)
from sems_rl.agents.sac import SACAgent
from sems_rl.experiments.sac_experiment import (
    ROOT, episode, episode_metrics, experiment_metadata, make_env,
    policy_function, protocol_fingerprint, scenario_days, seed_everything,
)

st.set_page_config(page_title='SAC · Quản lý năng lượng', page_icon='🔋', layout='wide')
COLORS = {'SAC': '#0d9488', 'Không dùng pin': '#94a3b8', 'Điều khiển theo luật': '#f59e0b'}
SEED_COLORS = ['#0d9488', '#2563eb', '#a855f7', '#f97316', '#dc4b72']
st.markdown('''<style>
.stApp{background:#f5f7fb}.block-container{padding-top:5rem;max-width:1480px}
[data-testid="stSidebar"]{background:white;border-right:1px solid #e5eaf1}
.sac-hero{background:#10243e;color:white;border-radius:18px;padding:26px 32px;margin-bottom:22px}
.sac-hero .eyebrow{color:#64e5cc;font-size:12px;letter-spacing:2px;font-weight:700}
.sac-hero h1{font-size:30px;line-height:1.3;margin:10px 0;color:white}
.sac-hero p{color:#c2cfe1;margin:0;font-size:15px}
[data-testid="stMetric"]{background:white;border:1px solid #e2e8f0;border-radius:12px;padding:17px}
[data-testid="stMetricLabel"]{color:#60718a;font-size:13px}
[data-testid="stMetricValue"]{font-size:28px;color:#10243e}
button[data-baseweb="tab"]{font-size:15px;padding:12px 18px}
.stTabs [aria-selected="true"]{color:#0d9488}
.stTabs [data-baseweb="tab-highlight"]{background-color:#0d9488}
</style>''', unsafe_allow_html=True)


def money(value):
    return f'{value:,.0f} đ'.replace(',', '.')


def chart(figure, height=350):
    figure.update_layout(template='plotly_white', height=height, margin=dict(l=15, r=15, t=30, b=15),
                         legend=dict(orientation='h', y=-0.22), hovermode='x unified',
                         font=dict(family='Arial', color='#30425a'), paper_bgcolor='white')
    st.plotly_chart(figure, width='stretch')


def token(path):
    """Đổi khóa cache khi thay checkpoint hoặc metadata tại cùng đường dẫn."""
    return tuple((name, (Path(path) / name).stat().st_mtime_ns)
                 for name in ('best.pt', 'metadata.json', 'training_summary.json'))


@st.cache_resource
def load_run(run_path, version):
    path = Path(run_path)
    metadata = read_json(path / 'metadata.json')
    settings = deepcopy(metadata['settings'])
    dataset = ROOT / 'data/processed.csv'
    current = experiment_metadata(settings, metadata['backend'], metadata['seed'], dataset)
    if current['fingerprint'] != protocol_fingerprint(metadata):
        raise ValueError('Dữ liệu hoặc quy ước hiện tại khác lúc huấn luyện.')
    settings['environment']['data']['file_path'] = str(dataset)
    seed_everything(0, settings['training']['torch_threads'])
    model = SACAgent.load(path / 'best.pt', device='cpu')
    env = make_env(settings, 'val')
    pipeline = env.unwrapped.data_pipeline
    env.close()
    return model, settings, metadata, pipeline


@st.cache_data
def simulate_day(run_path, version, split, scenario, day, initial_soc):
    """Ba bộ điều khiển dùng cùng ngày, cùng SoC đầu và cùng seed nhiễu."""
    model, settings, _, pipeline = load_run(run_path, version)
    env = make_env(settings, split, scenario, pipeline)
    histories = {}
    for label, baseline in [('Không dùng pin', 'no_battery'), ('Điều khiển theo luật', 'rule_based'), ('SAC', None)]:
        policy = policy_function(model if baseline is None else None, baseline, env.unwrapped.p_th)
        histories[label] = episode(env, policy, day, day, initial_soc)
    metrics = {name: episode_metrics(history, env, initial_soc, histories['Không dùng pin'])
               for name, history in histories.items()}
    env.close()
    return {name: pd.DataFrame(history) for name, history in histories.items()}, metrics


available = discover_experiments()
with st.sidebar:
    st.markdown('### 🔋 SAC · ENERGY LAB')
    st.caption('Kết quả huấn luyện và mô hình thực')
    chosen = st.selectbox('Thí nghiệm', available, format_func=lambda p: p.name) if available else ROOT / 'runs/sac_colab_20261128'
    root = Path(st.text_input('Thư mục kết quả', str(chosen), help='Thư mục có configuration_lock.json và final/.'))
    st.divider()
    st.caption('Giao diện đọc kết quả đã lưu. Chọn lại ngày hoặc seed không cập nhật trọng số.')

if not (root / 'configuration_lock.json').is_file():
    st.title('SAC · Chưa có dữ liệu thí nghiệm')
    st.info('Chép thư mục kết quả Colab vào runs/, gồm configuration_lock.json, final/ và final_validation/. '
            'Sau đó chọn thư mục bên trái. Xem docs/SAC_NGUYEN_VAN_TRUONG.md.')
    st.stop()

try:
    lock = read_json(root / 'configuration_lock.json')
    seeds = seed_summary(root)
    logs = learning_logs(root)
    splits = [s for s in ('val', 'test') if evaluation_available(root, s)]
    if not splits or seeds.empty:
        raise ValueError('Chưa có đủ metadata mô hình và kết quả đánh giá.')
    with st.sidebar:
        split = st.selectbox('Bộ kết quả', splits, format_func=lambda s: 'Validation · chọn mô hình' if s == 'val' else 'Test · đánh giá cuối')
        seed = st.selectbox('Seed dùng mô phỏng ngày', seeds.seed.tolist(), format_func=lambda s: f'Seed {s}')
        st.caption(f'Cấu hình: {lock["selected"]} · {lock["final_steps"]:,} bước/seed')
        if 'test' not in splits:
            st.caption('Chưa có kết quả test. Số liệu hiện tại thuộc validation.')
    summary, daily = evaluation(root, split)
    comparison = cost_comparison(summary)
    run_path = str(root / f'final/custom_seed{seed}')
    model, settings, metadata, pipeline = load_run(run_path, token(run_path))
except (OSError, ValueError, KeyError, RuntimeError) as error:
    st.error(f'Không thể đọc thí nghiệm: {error}')
    st.stop()

split_name = 'VALIDATION' if split == 'val' else 'TEST'
devices = ', '.join(sorted(seeds.device.unique())).upper()
st.markdown(f'''<div class="sac-hero"><div class="eyebrow">SAC · SMART ENERGY MANAGEMENT</div>
<h1>Theo dõi huấn luyện & kiểm chứng SAC</h1>
<p>{escape(split_name)} · {escape(devices)} · {len(seeds)} seed · {escape(lock['selected'])}
 · Pin 200 kWh / 50 kW · Dữ liệu mô phỏng</p></div>''', unsafe_allow_html=True)

s5 = comparison[comparison.scenario.eq('S5')].set_index('method')
sac = s5.loc['custom']
cards = st.columns(4)
cards[0].metric('Tổng chi phí điều chỉnh · S5', money(sac.adjusted_total_cost_vnd_mean),
                f'{sac.total_saving_vs_no_battery_pct:+.2f}% so với không pin')
cards[1].metric('Độ lệch chuẩn giữa seed', money(sac.adjusted_total_cost_vnd_std_seeds))
cards[2].metric('Ngân sách huấn luyện đã chạy', f'{int(seeds.trained_steps.sum()):,} bước')
cards[3].metric('Seed hoàn thành', f'{int(seeds.complete.sum())}/{len(seeds)}')
st.caption(f'Chi phí là trung bình đồng/ngày trên {split_name.lower()}. '
           'Bảng tổng hợp dùng mọi seed; mô phỏng ngày dùng seed được chọn bên trái.')
origin = read_json(root / ('final_test' if split == 'test' else 'final_validation') / 'evaluation_origin.json')
if origin.get('origin') == 'local_locked_checkpoints':
    st.caption('Bộ kết quả này được đánh giá trên máy cục bộ từ các checkpoint đã khóa; '
               'validation gốc trên Drive được giữ nguyên.')

tab_overview, tab_learning, tab_evaluation, tab_day, tab_source = st.tabs([
    'Tổng quan', 'Log huấn luyện', 'Đánh giá S1–S5', 'Hành vi sạc / xả', 'Nguồn & cách chạy',
])

with tab_overview:
    left, right = st.columns([1.3, 1])
    with left:
        st.subheader('So sánh tổng chi phí · S5')
        values = comparison[comparison.scenario.eq('S5')].copy()
        values['Phương pháp'] = values.method.map(METHOD_NAMES)
        chart(px.bar(values, x='Phương pháp', y='adjusted_total_cost_vnd_mean', color='Phương pháp',
                     color_discrete_map=COLORS, error_y='adjusted_total_cost_vnd_std_seeds',
                     labels={'adjusted_total_cost_vnd_mean': 'Tổng chi phí điều chỉnh (đ/ngày)'}))
    with right:
        st.subheader('Nhận xét từ kết quả đang chọn')
        st.write(f'SAC: **{money(sac.adjusted_total_cost_vnd_mean)}/ngày**. '
                 f'Tiết kiệm tổng chi phí so với không pin: **{sac.total_saving_vs_no_battery_pct:+.2f}%**; '
                 f'so với điều khiển theo luật: **{sac.total_saving_vs_rule_based_pct:+.2f}%**.')
        weaker = comparison[comparison.method.eq('custom') & comparison.total_saving_vs_rule_based_pct.lt(0)]
        if not weaker.empty:
            st.warning('SAC còn cao hơn bộ điều khiển theo luật về tổng chi phí ở: '
                       + ', '.join(weaker.scenario) + '. Cần xem thêm hành vi từng ngày.')
        weaker_than_no_battery = comparison[
            comparison.method.eq('custom') & comparison.total_saving_vs_no_battery_pct.lt(0)]
        if not weaker_than_no_battery.empty:
            st.warning('SAC còn cao hơn không dùng pin về tổng chi phí ở: '
                       + ', '.join(weaker_than_no_battery.scenario) + '.')
        st.write(f'Trung bình **{sac.clipped_steps_mean:.1f}/96 lệnh** mỗi ngày bị bộ lọc điều chỉnh. '
                 'Đây là lệnh chưa khả thi; không đồng nghĩa pin đã vượt giới hạn an toàn.')
        st.caption('Thanh sai số là độ lệch chuẩn giữa seed. Hai mốc đối chuẩn có một kết quả cố định; '
                   'độ lệch chuẩn bằng 0 không phải một thí nghiệm nhiều seed.')
    st.subheader('Checkpoint chính thức của từng seed')
    st.dataframe(seeds.drop(columns='run_path').rename(columns={
        'seed': 'Seed', 'trained_steps': 'Bước đã chạy', 'planned_steps': 'Ngân sách',
        'best_step': 'Bước tốt nhất', 'best_cost_vnd': 'Chi phí validation tốt nhất (đ/ngày)',
        'last_cost_vnd': 'Chi phí ở bước cuối (đ/ngày)', 'elapsed_minutes': 'Thời gian (phút)',
        'device': 'Thiết bị train', 'complete': 'Hoàn thành',
    }), hide_index=True, width='stretch')
    st.info('Chi phí điều chỉnh có định giá lượng điện còn trong pin. '
            'Cần đọc cùng hóa đơn gốc và hao mòn; đây là kết quả mô phỏng.')

with tab_learning:
    st.subheader('Quá trình học của 5 seed')
    selected_seeds = st.multiselect('Seed hiển thị trên đồ thị', seeds.seed.tolist(), default=seeds.seed.tolist())
    validation = logs['validation'][logs['validation'].seed.isin(selected_seeds)].copy()
    validation['Seed'] = validation.seed.map(lambda s: f'Seed {s}')
    c1, c2 = st.columns(2)
    for column, field, title in [(c1, 'adjusted_total_cost_vnd_mean', 'Chi phí validation · thấp hơn tốt hơn'),
                                  (c2, 'episode_reward_mean', 'Reward validation · cao hơn tốt hơn')]:
        with column:
            st.markdown(f'**{title}**')
            figure = px.line(validation, x='step', y=field, color='Seed', markers=True,
                             color_discrete_sequence=SEED_COLORS,
                             labels={'step': 'Bước huấn luyện', field: 'đ/ngày' if 'cost' in field else 'Reward/ngày'})
            for row in seeds[seeds.seed.isin(selected_seeds)].itertuples():
                picked = validation[validation.seed.eq(row.seed) & validation.step.eq(row.best_step)]
                if not picked.empty:
                    figure.add_trace(go.Scatter(x=picked.step, y=picked[field], mode='markers',
                        marker=dict(symbol='star', size=13, color=SEED_COLORS[row.seed % len(SEED_COLORS)]),
                        name=f'Best seed {row.seed}', showlegend=False))
            chart(figure)
    st.caption('Dấu sao là checkpoint có chi phí validation thấp nhất. '
               'Đây là đánh giá định kỳ, không phải reward của từng bước train.')
    metric = st.selectbox('Chỉ số tối ưu trong training.csv', ['critic_loss', 'actor_loss', 'alpha_loss', 'alpha', 'q_mean'])
    train = logs['training'][logs['training'].seed.isin(selected_seeds)].dropna(subset=[metric]).copy()
    train['Seed'] = train.seed.map(lambda s: f'Seed {s}')
    chart(px.line(train, x='step', y=metric, color='Seed', color_discrete_sequence=SEED_COLORS,
                  labels={'step': 'Bước huấn luyện', metric: metric}), height=330)
    st.caption('Loss và alpha ghi mỗi 1.000 bước; 5.000 bước đầu thu thập ngẫu nhiên nên chưa có loss.')
    with st.expander('Xem và tải log gốc'):
        st.dataframe(logs['training'], hide_index=True, width='stretch')
        for name in ('training', 'validation'):
            st.download_button(f'Tải {name}.csv của mọi seed', logs[name].to_csv(index=False).encode('utf-8-sig'),
                               f'{name}_all_seeds.csv', 'text/csv')
        console = root / 'analysis/colab_console.log'
        if console.is_file():
            st.download_button('Tải console Colab đã lưu', console.read_bytes(), 'colab_console.log', 'text/plain')

with tab_evaluation:
    st.subheader(f'Đánh giá {split_name.lower()} · cùng ngày và cùng điều kiện')
    labels = {
        'adjusted_total_cost_vnd_mean': 'Tổng chi phí điều chỉnh (đ/ngày)',
        'daily_cost_j_mean': 'Tiền điện gốc (đ/ngày)',
        'adjusted_electric_cost_vnd_mean': 'Tiền điện sau định giá tồn kho (đ/ngày)',
        'wear_cost_vnd_mean': 'Hao mòn pin (đ/ngày)', 'clipped_steps_mean': 'Lệnh bị cắt / ngày',
        'peak_buy_kw_mean': 'Đỉnh mua điện (kW)', 'final_soc_mean': 'SoC cuối ngày (0–1)',
    }
    metric = st.selectbox('Tiêu chí so sánh', list(labels), format_func=labels.get)
    values = comparison.copy()
    values['Phương pháp'] = values.method.map(METHOD_NAMES)
    chart(px.bar(values, x='scenario', y=metric, color='Phương pháp', barmode='group',
                 error_y=metric.replace('_mean', '_std_seeds'), color_discrete_map=COLORS,
                 labels={'scenario': 'Kịch bản', metric: labels[metric]}), height=390)
    visible = comparison[['method', 'scenario', 'seed_count', 'daily_cost_j_mean',
        'adjusted_electric_cost_vnd_mean', 'adjusted_total_cost_vnd_mean',
        'adjusted_total_cost_vnd_std_seeds', 'total_saving_vs_no_battery_pct',
        'total_saving_vs_rule_based_pct', 'wear_cost_vnd_mean', 'clipped_steps_mean', 'final_soc_mean']].copy()
    visible['method'] = visible.method.map(METHOD_NAMES)
    visible = visible.rename(columns={
        'method': 'Phương pháp', 'scenario': 'Kịch bản', 'seed_count': 'Số seed',
        'daily_cost_j_mean': 'Tiền điện gốc (đ/ngày)',
        'adjusted_electric_cost_vnd_mean': 'Tiền điện điều chỉnh (đ/ngày)',
        'adjusted_total_cost_vnd_mean': 'Tổng chi phí điều chỉnh (đ/ngày)',
        'adjusted_total_cost_vnd_std_seeds': 'Độ lệch chuẩn giữa seed (đ)',
        'total_saving_vs_no_battery_pct': 'Tiết kiệm tổng chi phí so với không pin (%)',
        'total_saving_vs_rule_based_pct': 'Tiết kiệm tổng chi phí so với luật (%)',
        'wear_cost_vnd_mean': 'Hao mòn (đ/ngày)', 'clipped_steps_mean': 'Lệnh bị cắt/ngày',
        'final_soc_mean': 'SoC cuối (0–1)',
    })
    st.dataframe(visible, hide_index=True, width='stretch')
    baseline_bill = comparison[comparison.method.eq('no_battery')].set_index('scenario').daily_cost_j_mean
    higher_bill = comparison[comparison.method.eq('custom') &
                             comparison.daily_cost_j_mean.gt(comparison.scenario.map(baseline_bill))]
    if not higher_bill.empty:
        st.info('Tiền điện gốc của SAC cao hơn không dùng pin ở: ' + ', '.join(higher_bill.scenario)
                + '. Chi phí điều chỉnh còn xét hao mòn và giá trị điện giữ lại trong pin; '
                'xem SoC cuối ngày trước khi diễn giải mức tiết kiệm.')
    st.caption('S1: thứ Hai–thứ Bảy · S2: Chủ nhật · S3: PV vật lý giảm 50% · '
               'S4: nhiễu quan sát tải/PV · S5: toàn bộ ngày. Các kịch bản có ngày trùng nhau.')
    st.caption('Tiết kiệm tổng chi phí được tính từ trung bình tổng chi phí. '
               'adjusted_cost_saving_pct_mean trong CSV là trung bình % tiết kiệm tiền điện từng ngày; đó là phép đo khác.')
    st.download_button('Tải bảng đánh giá đang xem', comparison.to_csv(index=False).encode('utf-8-sig'),
                       f'sac_{split}_comparison.csv', 'text/csv')
    with st.expander('Dữ liệu đánh giá từng ngày, từng seed'):
        st.dataframe(daily, hide_index=True, width='stretch')

with tab_day:
    st.subheader('Quan sát quyết định sạc / xả của checkpoint thật')
    c1, c2, c3 = st.columns([1.2, 1, 1])
    scenario = c1.selectbox('Kịch bản vận hành', list(SCENARIO_NAMES), index=4,
                            format_func=lambda s: f'{s} · {SCENARIO_NAMES[s]}')
    env = make_env(settings, split, scenario, pipeline)
    days = scenario_days(env, split, scenario)
    env.close()
    day = c2.selectbox('Ngày vận hành', days,
        format_func=lambda d: str(pipeline.get_day_data(d, split).iloc[0].timestamp)[:10])
    initial_soc = c3.slider('SoC ban đầu', 0.20, 0.90, 0.50, 0.05)
    date = str(pipeline.get_day_data(day, split).iloc[0].timestamp)[:10]
    st.caption(f'Seed {seed} · best tại {int(seeds.loc[seeds.seed.eq(seed), "best_step"].iloc[0]):,} bước · '
               f'{split_name} · {scenario} · {date} · SoC đầu {initial_soc:.0%}. '
               'Ba phương pháp dùng cùng điều kiện. Khi so hai lượt CPU/GPU, giữ nguyên các điều kiện này.')
    try:
        histories, metrics = simulate_day(run_path, token(run_path), split, scenario, day, initial_soc)
    except (OSError, ValueError, RuntimeError) as error:
        st.error(f'Không thể chạy mô hình: {error}')
        st.stop()
    trace = histories['SAC']
    cols = st.columns(4)
    cols[0].metric('Tổng chi phí điều chỉnh · SAC', money(metrics['SAC']['adjusted_total_cost_vnd']))
    cols[1].metric('Tiền điện gốc · SAC', money(metrics['SAC']['daily_cost_j']))
    cols[2].metric('Hao mòn pin · SAC', money(metrics['SAC']['wear_cost_vnd']))
    cols[3].metric('SoC cuối ngày · SAC', f'{metrics["SAC"]["final_soc"]:.1%}')
    st.dataframe(pd.DataFrame([{'Phương pháp': name, 'Tiền điện gốc (đ)': v['daily_cost_j'],
        'Định giá điện pin (đ)': v['inventory_adjustment_vnd'], 'Hao mòn (đ)': v['wear_cost_vnd'],
        'Tổng chi phí điều chỉnh (đ)': v['adjusted_total_cost_vnd'], 'SoC cuối (%)': v['final_soc'] * 100,
        'Lệnh bị cắt': v['clipped_steps']} for name, v in metrics.items()]), hide_index=True, width='stretch')
    step = st.slider('Xem quyết định ở bước', 0, len(trace) - 1, 38)
    current = trace.iloc[step]
    hour = f'{int(current.hour):02d}:{int(round(current.hour % 1 * 60)):02d}'
    mode = 'SẠC' if current.p_batt_kw > 0.01 else 'XẢ' if current.p_batt_kw < -0.01 else 'NGHỈ'
    st.write(f'**{hour} · {mode}** — Yêu cầu **{current.p_cmd_kw:+.2f} kW**, '
             f'thực hiện **{current.p_batt_kw:+.2f} kW**; SoC **{current.old_soc:.1%} → {current.soc:.1%}**.')
    if current.is_clipped:
        st.warning('Lệnh đã được bộ lọc an toàn điều chỉnh theo giới hạn công suất/SoC.')
    figure = make_subplots(rows=3, cols=1, shared_xaxes=True, vertical_spacing=0.08)
    for field, label, color in [('p_load_kw', 'Tải', '#2563eb'), ('p_pv_kw', 'PV', '#f59e0b'),
                                 ('p_batt_kw', 'Pin (+ sạc, − xả)', '#0d9488'), ('p_buy_kw', 'Mua lưới · SAC', '#a855f7')]:
        figure.add_trace(go.Scatter(x=trace.hour, y=trace[field], name=label, line=dict(color=color)), row=1, col=1)
    # SoC trong info là mức pin SAU hành động: dịch thêm 15 phút, thêm mốc đầu ngày.
    for label, history in histories.items():
        x = [0.0] + (history.hour + settings['environment']['system']['delta_t']).tolist()
        y = [initial_soc * 100] + (history.soc * 100).tolist()
        figure.add_trace(go.Scatter(x=x, y=y, name=f'SoC · {label}', line=dict(color=COLORS[label])), row=2, col=1)
    for bound in ('soc_min', 'soc_max'):
        figure.add_hline(y=settings['environment']['battery'][bound] * 100,
                         line_dash='dot', line_color='#dc4b72', row=2, col=1)
    figure.add_trace(go.Scatter(x=trace.hour, y=trace.c_grid, name='Giá điện',
                                line=dict(color='#64748b', shape='hv')), row=3, col=1)
    figure.add_vline(x=float(current.hour), line_dash='dot', line_color='#94a3b8')
    figure.update_yaxes(title_text='Công suất (kW)', row=1, col=1)
    figure.update_yaxes(title_text='SoC (%)', row=2, col=1)
    figure.update_yaxes(title_text='đ/kWh', row=3, col=1)
    figure.update_xaxes(title_text='Giờ trong ngày', row=3, col=1)
    chart(figure, height=750)
    with st.expander('96 quyết định và các thành phần chi phí'):
        st.dataframe(trace, hide_index=True, width='stretch')
        st.download_button('Tải CSV ngày đang xem', trace.to_csv(index=False).encode('utf-8-sig'),
                           f'sac_seed{seed}_{split}_{scenario}_{date}.csv', 'text/csv')

with tab_source:
    st.subheader('Nguồn kết quả và kiểm tra tính nhất quán')
    provenance = read_json(root / 'import_manifest.json')
    if provenance.get('notebook_url'):
        st.link_button('Mở notebook nguồn', provenance['notebook_url'])
    st.write('Thư mục đang đọc:', str(root.resolve()))
    checks = integrity_checks(root)
    st.dataframe(checks, hide_index=True, width='stretch')
    if checks.passed.all():
        st.success('Dữ liệu, cấu hình, checkpoint và bảng tổng hợp khớp các kiểm tra nguồn.')
    else:
        st.error('Có kiểm tra nguồn chưa đạt. Xem các dòng False trước khi sử dụng kết quả.')
    st.markdown('**Cách chạy lại giao diện**')
    st.code('.\\.venv\\Scripts\\python.exe -m streamlit run dashboard_sac.py --server.address 127.0.0.1 --server.port 8501', language='powershell')
    st.write('Mở http://127.0.0.1:8501, chọn thí nghiệm → tổng quan → log → đánh giá S1–S5 → '
             'chọn ngày để giải thích hành vi. Giao diện dùng CPU để suy luận trọng số đã lưu.')
    st.caption('Dữ liệu và biểu giá là mô phỏng. S4 chỉ gây nhiễu quan sát. '
               'Chi phí tồn kho là một giả định định giá; số lệnh bị cắt cần đọc cùng bộ lọc an toàn.')
    report = root / 'analysis/bao_cao_sac.html'
    if report.is_file():
        st.download_button('Tải báo cáo HTML tương tác', report.read_bytes(), 'bao_cao_sac.html', 'text/html')
    with st.expander('Cấu hình đã sử dụng'):
        st.json({'configuration_lock': lock, 'agent': settings['agent'],
                 'training': settings['training'], 'device': metadata.get('device')})
