from ltdi.stats import median, ranks, spearman


def test_ranks_average_ties():
    assert ranks([10, 20, 20, 5]) == [2, 3.5, 3.5, 1]


def test_spearman():
    assert abs(spearman([1, 2, 3, 4], [10, 20, 30, 40]) - 1) < 1e-9
    assert abs(spearman([1, 2, 3, 4], [4, 3, 2, 1]) + 1) < 1e-9


def test_median():
    assert median([3, 1, 2]) == 2 and median([1, 2, 3, 4]) == 2.5
