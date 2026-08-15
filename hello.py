def greet(name: str) -> str:
    return f"Hello, {name}!"


def add(a: int, b: int) -> int:
    return a + b


if __name__ == "__main__":
    print(greet("World"))
    print(f"1 + 2 = {add(1, 2)}")
