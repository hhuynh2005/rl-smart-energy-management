"""Lưu đủ trạng thái SAC để tiếp tục seed bị ngắt trên Colab.

best.pt chỉ phục vụ suy luận. resume.pt có thêm replay buffer, bộ sinh số ngẫu
nhiên, trạng thái môi trường và bản sao CSV/best tại đúng bước đã lưu.
"""

import random
import time
from copy import deepcopy

import numpy as np
import torch

from sems_rl.agents.sac import SACAgent


def portable_settings(settings):
    """Cho phép chuyển thư mục máy/Drive; các tham số thí nghiệm phải giữ nguyên."""
    result = deepcopy(settings)
    result["environment"]["data"].pop("file_path", None)
    return result


def save_resume(path, model, env, recorder, step, observation, metadata):
    base, buffer = env.unwrapped, model.buffer
    numpy_state = np.random.get_state()
    contents = {}
    for name in ("training.csv", "validation.csv", "best_validation_days.csv"):
        file = recorder.run_dir / name
        if file.is_file():
            contents[name] = file.read_text(encoding="utf-8")
    state = {
        "format_version": 1, "step": step, "device_type": model.device.type,
        "settings": portable_settings(recorder.settings),
        "fingerprint": metadata["fingerprint"], "model": model.checkpoint_state(),
        "observation": torch.as_tensor(observation.copy()),
        "buffer": {
            "position": buffer.position, "size": buffer.size,
            "rng": buffer.rng.bit_generator.state,
            "arrays": {name: torch.from_numpy(getattr(buffer, name)[:buffer.size].copy())
                       for name in ("observations", "actions", "rewards",
                                    "next_observations", "terminated")},
        },
        "environment": {
            "day": base.current_day_offset, "step": base.current_step,
            "soc": base.battery.soc,
            "throughput": base.battery.total_throughput_kwh,
            "efc": base.battery.total_efc,
            "rng": base.np_random.bit_generator.state,
            "action_rng": env.action_space.np_random.bit_generator.state,
            "scenario_rng": env.rng.bit_generator.state,
        },
        "recorder": {
            "best_score": recorder.best_score, "best_step": recorder.best_step,
            "last_eval_step": recorder.last_eval_step,
            "elapsed": time.perf_counter() - recorder.started,
        },
        "csv": contents,
        "best": torch.load(recorder.run_dir / "best.pt", map_location="cpu", weights_only=True),
        "torch_rng": torch.get_rng_state(),
        "cuda_rng": torch.cuda.get_rng_state_all() if model.device.type == "cuda" else [],
        "numpy_rng": (numpy_state[0], numpy_state[1].tolist(), *numpy_state[2:]),
        "python_rng": random.getstate(),
    }
    temporary = path.with_name(path.name + ".tmp")
    torch.save(state, temporary)
    temporary.replace(path)


def load_resume(path, settings, metadata, device):
    # Chỉ nạp tensor/kiểu dữ liệu cơ bản; không unpickle đối tượng Python tùy ý.
    state = torch.load(path, map_location="cpu", weights_only=True)
    if state["format_version"] != 1:
        raise ValueError("Định dạng resume chưa được hỗ trợ.")
    if state["fingerprint"] != metadata["fingerprint"]:
        raise ValueError("Resume khác dữ liệu hoặc quy ước thí nghiệm.")
    if state["settings"] != portable_settings(settings):
        raise ValueError("Cấu hình đã thay đổi; cần dùng thư mục thí nghiệm mới.")
    if state["device_type"] != torch.device(device).type:
        raise ValueError("Để resume cùng chuỗi RNG, cần giữ CPU/CUDA như lần trước.")
    return state


def restore_resume(state, env, recorder, device):
    model = SACAgent.from_checkpoint(state["model"], device)
    buffer_state = state["buffer"]
    for name, tensor in buffer_state["arrays"].items():
        getattr(model.buffer, name)[:buffer_state["size"]] = tensor.numpy()
    model.buffer.position = buffer_state["position"]
    model.buffer.size = buffer_state["size"]
    model.buffer.rng.bit_generator.state = buffer_state["rng"]

    saved, base = state["environment"], env.unwrapped
    env.reset(options={"day_offset": saved["day"], "initial_soc": saved["soc"]})
    base.current_step = saved["step"]
    base.battery.total_throughput_kwh = saved["throughput"]
    base.battery.total_efc = saved["efc"]
    base.np_random.bit_generator.state = saved["rng"]
    env.action_space.np_random.bit_generator.state = saved["action_rng"]
    env.rng.bit_generator.state = saved["scenario_rng"]

    saved_recorder = state["recorder"]
    recorder.best_score = saved_recorder["best_score"]
    recorder.best_step = saved_recorder["best_step"]
    recorder.last_eval_step = saved_recorder["last_eval_step"]
    recorder.started = time.perf_counter() - saved_recorder["elapsed"]
    for name, contents in state["csv"].items():
        (recorder.run_dir / name).write_text(contents, encoding="utf-8")
    # Nếu phiên bị ngắt sau checkpoint, best/CSV có thể đã đi xa hơn checkpoint.
    # Khôi phục đồng bộ để không so mô hình hiện tại với một best thuộc tương lai.
    temporary = recorder.run_dir / "best.pt.tmp"
    torch.save(state["best"], temporary)
    temporary.replace(recorder.run_dir / "best.pt")
    torch.set_rng_state(state["torch_rng"])
    if state["cuda_rng"]:
        torch.cuda.set_rng_state_all(state["cuda_rng"])
    numpy_state = state["numpy_rng"]
    np.random.set_state((numpy_state[0], np.array(numpy_state[1], dtype=np.uint32), *numpy_state[2:]))
    random.setstate(state["python_rng"])
    return model, state["observation"].numpy().copy()
