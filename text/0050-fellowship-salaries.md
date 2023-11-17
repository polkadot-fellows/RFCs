# RFC-0050: Fellowship Salaries

|                 |                                                                               |
| --------------- | ----------------------------------------------------------------------------- |
| **Start Date**  | 15 November 2023                                                              |
| **Description** | Proposal to set rank-based Fellowship salary levels.                          |
| **Authors**     | Joe Petrowski, Gavin Wood                                                     |

## Summary

The Fellowship Manifesto states that members should receive a monthly allowance on par with gross
income in OECD countries. This RFC proposes concrete amounts.

## Motivation

One motivation for the Technical Fellowship is to provide an incentive mechanism that can induct and
retain technical talent for the continued progress of the network.

In order for members to uphold their commitment to the network, they should receive support to
ensure that their needs are met such that they have the time to dedicate to their work on Polkadot.
Given the high expectations of Fellows, it is reasonable to consider contributions and requirements
on par with a full-time job. Providing a livable wage to those making such contributions makes it
pragmatic to work full-time on Polkadot.

Note: Goals of the Fellowship, expectations for each Dan, and conditions for promotion and demotion
are all explained in the Manifesto. This RFC is only to propose concrete values for allowances.

## Stakeholders

- Fellowship members
- Polkadot Treasury

## Explanation

Although the Manifesto (Section 8) specifies a monthly allowance in DOT, this RFC proposes the use
of USDT instead. The allowance is meant to provide members stability in meeting their day-to-day
needs and recognize contributions. Using USDT provides more stability and less speculation.

This RFC proposes the following yearly salary levels in USDT, based on rank:

| Dan  | Annual Salary |
|:----:|:-------------:|
|    I |     10,000    |
|   II |     20,000    |
|  III |     80,000    |
|   IV |    120,000    |
|    V |    160,000    |
|   VI |    200,000    |
|  VII |    200,000    |
| VIII |    200,000    |
|   IX |    200,000    |

Note that there is a sizable increase between II Dan (Proficient) and III Dan (Fellow). By the third
Dan, it is generally expected that one is working on Polkadot as their primary focus in a full-time
capacity. The salary at this level is commensurate with average salaries in OECD countries (note:
77,000 USD in the U.S., with an average engineer at 100,000 USD).

The salary increases for Architects (IV, V, and VI Dan) with levels typical of senior engineers.

Allowances will be managed by the Salary pallet.

### Projections

Based on the current membership, the maximum yearly and monthly costs are shown below:

| Dan   | Salary  | Members | Yearly    | Monthly |
|:-----:|:-------:|:-------:| ---------:| -------:|
|     I |  10,000 |      27 |   270,000 |  22,500 |
|    II |  20,000 |      11 |   220,000 |  18,333 |
|   III |  80,000 |       8 |   640,000 |  53,333 |
|    IV | 120,000 |       3 |   360,000 |  30,000 |
|     V | 160,000 |       5 |   800,000 |  66,667 |
|    VI | 200,000 |       3 |   600,000 |  50,000 |
|  > VI | 200,000 |       0 |         0 |       0 |
|       |         |         |           |         |
| Total |         |         | 2,890,000 | 240,833 |

Note that these are the maximum amounts; members may choose to take a passive (lower) level. On the
other hand, more people will likely join the Fellowship in the coming years.

## Drawbacks

By not using DOT for payment, the protocol relies on the stability of other assets and the ability
to acquire them. However, the asset of choice can be changed in the future.

## Testing, Security, and Privacy

N/A.

## Performance, Ergonomics, and Compatibility

### Performance

N/A

### Ergonomics

N/A

### Compatibility

N/A

## Prior Art and References

- [The Polkadot Fellowship
  Manifesto](https://github.com/polkadot-fellows/manifesto/blob/5e01eef15eded63f1db9be808b0f7c11bb9f4a12/manifesto.pdf)
- [OECD Average Wages](https://data.oecd.org/earnwage/average-wages.htm#indicator-chart)
- [Indeed: Average Salary for Engineers, United
  States](https://www.indeed.com/career/engineer/salaries)

## Unresolved Questions

None at present.
